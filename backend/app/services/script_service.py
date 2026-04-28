import re

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.character import Character
from app.models.environment import Environment
from app.models.scene import Scene
from app.models.script import Script
from app.models.shot import Shot
from app.models.shot_character import ShotCharacter
from app.services.settings_service import get_setting_value
from app.schemas.script import (
    GenerateScriptResponse,
    ParsedCharacterMatch,
    ParsedScene,
    ParsedShot,
    ParseResult,
)


async def get_script(db: AsyncSession, project_id: int) -> Script:
    result = await db.execute(
        select(Script).where(Script.project_id == project_id)
    )
    script = result.scalar_one_or_none()
    if script is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Script not found for this project",
        )
    return script


async def update_script(
    db: AsyncSession, project_id: int, content: str
) -> Script:
    script = await get_script(db, project_id)
    script.content = content
    script.parsed = False
    await db.commit()
    await db.refresh(script)
    return script


async def generate_script(
    db: AsyncSession, project_id: int, prompt: str, mode: str
) -> str:
    endpoint = await get_setting_value(db, "api.text.endpoint")
    api_key = await get_setting_value(db, "api.text.api_key")

    if not endpoint or not api_key:
        return "AI text API not configured. Please configure in Settings or .env."

    try:
        from app.ai.text_adapter import generate
        generated_text = await generate(
            endpoint=endpoint,
            api_key=api_key,
            prompt=prompt,
            mode=mode,
        )
        return generated_text
    except (ImportError, ModuleNotFoundError):
        return "AI text API not configured. Please configure in Settings or .env."


async def _fallback_parse(content: str) -> list[dict]:
    """Parse script by splitting on double newlines (paragraphs as scenes, sentences as shots)."""
    paragraphs = re.split(r"\n\s*\n", content.strip())
    scenes = []
    for index, paragraph in enumerate(paragraphs):
        paragraph = paragraph.strip()
        if not paragraph:
            continue
        sentences = re.split(r"(?<=[.!?。！？])\s+", paragraph)
        sentences = [s.strip() for s in sentences if s.strip()]
        shots = []
        for shot_index, sentence in enumerate(sentences):
            shots.append(
                {
                    "title": f"Shot {shot_index + 1}",
                    "narration": sentence,
                    "dialogue": "",
                    "action_description": sentence,
                    "camera_angle": "medium",
                    "characters": [],
                }
            )
        scenes.append(
            {
                "title": f"Scene {index + 1}",
                "description_prompt": paragraph[:200],
                "environment_name": "",
                "shots": shots,
            }
        )
    return scenes


async def _ai_parse(content: str, db: AsyncSession) -> list[dict] | None:
    """Attempt AI-based script parsing. Returns None if AI is not configured."""
    endpoint = await get_setting_value(db, "api.text.endpoint")
    api_key = await get_setting_value(db, "api.text.api_key")

    if not endpoint or not api_key:
        return None

    try:
        from app.ai.text_adapter import generate
        import json

        parse_prompt = (
            "Please parse the following script into structured scenes and shots. "
            "Return a JSON array where each element has: title, description_prompt, "
            "environment_name, and shots (array of {title, narration, dialogue, "
            "action_description, camera_angle, characters (array of character names)}). "
            f"\n\nScript:\n{content}"
        )
        raw_result = await generate(
            endpoint=endpoint,
            api_key=api_key,
            prompt=parse_prompt,
            mode="generate",
        )
        return json.loads(raw_result)
    except Exception:
        return None


async def parse_script(db: AsyncSession, project_id: int) -> ParseResult:
    script = await get_script(db, project_id)
    if not script.content or not script.content.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Script content is empty",
        )

    warnings: list[str] = []

    # Try AI parse first, fallback to simple splitting
    parsed_scenes = await _ai_parse(script.content, db)
    if parsed_scenes is None:
        warnings.append("AI API not configured, using simple paragraph splitting as fallback.")
        parsed_scenes = await _fallback_parse(script.content)

    # Load existing characters and environments for matching
    characters_result = await db.execute(select(Character))
    all_characters = characters_result.scalars().all()

    environments_result = await db.execute(select(Environment))
    all_environments = environments_result.scalars().all()

    result_scenes: list[ParsedScene] = []
    scene_sort_order = 0

    for scene_data in parsed_scenes:
        scene_title = scene_data.get("title", "Untitled Scene")
        scene_description = scene_data.get("description_prompt", "")
        environment_name = scene_data.get("environment_name", "")

        # Match environment by ILIKE
        matched_environment_id = None
        environment_matched = False
        if environment_name:
            for env in all_environments:
                if env.name.lower() == environment_name.lower():
                    matched_environment_id = env.id
                    environment_matched = True
                    break
            if not environment_matched:
                warnings.append(f"Environment '{environment_name}' not found in database.")

        # Create Scene record
        scene = Scene(
            project_id=project_id,
            environment_id=matched_environment_id,
            title=scene_title,
            description_prompt=scene_description,
            sort_order=scene_sort_order,
        )
        db.add(scene)
        await db.flush()
        scene_sort_order += 1

        # Process shots
        parsed_shots: list[ParsedShot] = []
        shot_sort_order = 0

        for shot_data in scene_data.get("shots", []):
            shot_title = shot_data.get("title", "")
            shot_narration = shot_data.get("narration", "")
            shot_dialogue = shot_data.get("dialogue", "")
            shot_action = shot_data.get("action_description", "")
            shot_camera = shot_data.get("camera_angle", "medium")
            character_names = shot_data.get("characters", [])

            # Create Shot record
            shot = Shot(
                scene_id=scene.id,
                title=shot_title,
                narration=shot_narration,
                dialogue=shot_dialogue,
                action_description=shot_action,
                camera_angle=shot_camera,
                sort_order=shot_sort_order,
                status="pending",
            )
            db.add(shot)
            await db.flush()
            shot_sort_order += 1

            # Match characters by ILIKE
            matched_characters: list[ParsedCharacterMatch] = []
            unmatched_characters: list[str] = []

            for char_name in character_names:
                found = False
                for character in all_characters:
                    if character.name.lower() == char_name.lower():
                        matched_characters.append(
                            ParsedCharacterMatch(
                                character_id=character.id,
                                name=character.name,
                                matched=True,
                            )
                        )
                        # Create ShotCharacter association
                        shot_character = ShotCharacter(
                            shot_id=shot.id,
                            character_id=character.id,
                        )
                        db.add(shot_character)
                        found = True
                        break
                if not found:
                    unmatched_characters.append(char_name)
                    warnings.append(
                        f"Character '{char_name}' in scene '{scene_title}' not found in database."
                    )

            parsed_shots.append(
                ParsedShot(
                    title=shot_title,
                    narration=shot_narration,
                    dialogue=shot_dialogue,
                    action_description=shot_action,
                    camera_angle=shot_camera,
                    matched_characters=matched_characters,
                    unmatched_characters=unmatched_characters,
                )
            )

        result_scenes.append(
            ParsedScene(
                title=scene_title,
                description_prompt=scene_description,
                matched_environment_id=matched_environment_id,
                environment_matched=environment_matched,
                shots=parsed_shots,
            )
        )

    # Mark script as parsed
    script.parsed = True
    await db.commit()

    return ParseResult(scenes=result_scenes, warnings=warnings)
