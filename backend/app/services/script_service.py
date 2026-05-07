import json
import logging
import re

from json_repair import repair_json
from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.character import Character
from app.models.environment import Environment
from app.models.scene import Scene
from app.models.script import Script
from app.models.shot import Shot
from app.models.shot_character import ShotCharacter
from app.services.settings_service import get_setting_value
from app.schemas.script import (
    ParsedCharacterMatch,
    ParsedScene,
    ParsedShot,
    ParseResult,
)

logger = logging.getLogger(__name__)


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
    model = await get_setting_value(db, "api.text.model")
    timeout = int(await get_setting_value(db, "api.text.timeout", "120"))

    if not endpoint or not api_key:
        return "AI text API not configured. Please configure in Settings or .env."

    try:
        from app.ai.text_adapter import generate
        generated_text = await generate(
            endpoint=endpoint,
            api_key=api_key,
            prompt=prompt,
            model=model,
            mode=mode,
            timeout=timeout,
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


def _extract_json_from_response(raw_text: str) -> str:
    """从 AI 响应中提取候选 JSON 文本。

    依次尝试：
    1. 剥掉 ```json ... ``` / ``` ... ``` markdown 代码块
    2. 截取"第一个 [ 或 { 到最后一个 ] 或 }"之间的子串，丢弃前后解释文字
    3. 兜底返回原文，让后续的 json_repair 继续修复
    """
    if not raw_text or not raw_text.strip():
        return ""
    text = raw_text.strip()

    # 1) markdown 代码块
    match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if match:
        text = match.group(1).strip()
        if text:
            return text

    # 2) 截取 JSON 主体：优先数组，其次对象
    #    处理 AI 在 JSON 前后夹带 "以下是结果：..." / "希望对你有帮助" 的情况
    for open_ch, close_ch in (("[", "]"), ("{", "}")):
        start = text.find(open_ch)
        end = text.rfind(close_ch)
        if start != -1 and end != -1 and end > start:
            return text[start : end + 1]

    # 3) 兜底原样返回
    return text


def _safe_parse_json(json_text: str):
    """用 json_repair 容错解析 AI 输出的 JSON。

    json_repair 能修复常见问题：
    - 末尾被截断（未闭合的数组/对象/字符串）
    - 多余/缺失的逗号
    - 使用单引号、Python 风格 True/False/None 等非标准语法
    - 字符串内部未转义的引号

    仍无法修复时返回 None，由调用方走 fallback。
    """
    if not json_text:
        return None
    # 先按标准 JSON 解析，走常规快路径
    try:
        return json.loads(json_text)
    except json.JSONDecodeError:
        pass
    # 标准解析失败：交给 json_repair 尽力修复
    try:
        repaired = repair_json(json_text, return_objects=True)
    except Exception as exc:
        logger.warning("json_repair 修复失败: %s", exc)
        return None
    # json_repair 在完全无法修复时会返回空字符串而非抛异常，这里统一视为失败
    if repaired == "" or repaired is None:
        return None
    return repaired


def _validate_parsed_scenes(data) -> list[dict] | None:
    """校验 AI 返回的 JSON 结构是否符合预期。"""
    if not isinstance(data, list):
        return None
    for item in data:
        if not isinstance(item, dict):
            return None
        # 确保 shots 字段是 list
        shots = item.get("shots")
        if shots is not None and not isinstance(shots, list):
            item["shots"] = []
    return data


async def _ai_parse(content: str, db: AsyncSession) -> list[dict] | None:
    """Attempt AI-based script parsing. Returns None if AI is not configured or fails."""
    endpoint = await get_setting_value(db, "api.text.endpoint")
    api_key = await get_setting_value(db, "api.text.api_key")

    if not endpoint or not api_key:
        return None

    model = await get_setting_value(db, "api.text.model")
    try:
        timeout = int(await get_setting_value(db, "api.text.timeout", "120"))
    except ValueError:
        timeout = 120

    try:
        from app.ai.text_adapter import generate

        parse_prompt = (
            "请将以下剧本解析为结构化的场景和镜头。"
            "返回一个 JSON 数组，每个元素包含: title, description_prompt, "
            "environment_name, 以及 shots（数组，每个元素包含 {title, narration, dialogue, "
            "action_description, camera_angle, characters（角色名称数组）}）。"
            "只输出 JSON 数组，不要输出其他任何文字。"
            f"\n\n剧本内容:\n{content}"
        )
        raw_result = await generate(
            endpoint=endpoint,
            api_key=api_key,
            prompt=parse_prompt,
            model=model,
            mode="generate",
            timeout=timeout,
        )

        json_text = _extract_json_from_response(raw_result)
        if not json_text:
            logger.warning("AI parse 返回空内容")
            return None

        parsed = _safe_parse_json(json_text)
        if parsed is None:
            # 打印前 300 字符帮助排查（raw 可能很长）
            preview = (raw_result or "")[:300].replace("\n", " ")
            logger.warning(
                "AI parse JSON 解析+修复均失败，原始响应预览: %s",
                preview,
            )
            return None

        validated = _validate_parsed_scenes(parsed)
        if validated is None:
            logger.warning(
                "AI parse 返回的 JSON 结构不符合预期: %s",
                type(parsed).__name__,
            )
            return None
        return validated
    except Exception as exc:
        logger.warning("AI parse 失败，将使用 fallback: %s", exc)
        return None


async def _cleanup_old_parse_data(db: AsyncSession, project_id: int) -> None:
    """清理项目下已有的场景和分镜数据，避免重复解析产生冗余记录。"""
    existing_scenes = await db.execute(
        select(Scene).where(Scene.project_id == project_id)
    )
    scene_list = list(existing_scenes.scalars().all())
    if not scene_list:
        return

    scene_ids = [s.id for s in scene_list]
    # 查出所有相关的 shot id
    shot_rows = await db.execute(
        select(Shot.id).where(Shot.scene_id.in_(scene_ids))
    )
    shot_ids = [row[0] for row in shot_rows.all()]

    # 按依赖顺序删除：ShotCharacter → Shot → Scene
    if shot_ids:
        await db.execute(
            delete(ShotCharacter).where(ShotCharacter.shot_id.in_(shot_ids))
        )
        await db.execute(
            delete(Shot).where(Shot.id.in_(shot_ids))
        )
    await db.execute(
        delete(Scene).where(Scene.project_id == project_id)
    )
    await db.flush()


async def parse_script(db: AsyncSession, project_id: int) -> ParseResult:
    script = await get_script(db, project_id)
    if not script.content or not script.content.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Script content is empty",
        )

    warnings: list[str] = []

    # 清理旧的解析数据，避免重复
    await _cleanup_old_parse_data(db, project_id)

    # Try AI parse first, fallback to simple splitting
    parsed_scenes = await _ai_parse(script.content, db)
    if parsed_scenes is None:
        warnings.append("AI 解析未启用或失败，使用简单段落分割作为备选方案。")
        parsed_scenes = await _fallback_parse(script.content)

    # Load existing characters and environments for matching
    characters_result = await db.execute(select(Character))
    all_characters = characters_result.scalars().all()

    environments_result = await db.execute(select(Environment))
    all_environments = environments_result.scalars().all()

    result_scenes: list[ParsedScene] = []
    scene_sort_order = 0

    for scene_data in parsed_scenes:
        if not isinstance(scene_data, dict):
            continue

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
                warnings.append(f"环境 '{environment_name}' 在资产库中未找到。")

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

        raw_shots = scene_data.get("shots") or []
        if not isinstance(raw_shots, list):
            raw_shots = []

        for shot_data in raw_shots:
            if not isinstance(shot_data, dict):
                continue

            # 使用 `or ""` 兜底：AI 返回 null/None 时也转成空串，避免 pydantic 校验失败
            shot_title = shot_data.get("title") or ""
            shot_narration = shot_data.get("narration") or ""
            shot_dialogue = shot_data.get("dialogue") or ""
            shot_action = shot_data.get("action_description") or ""
            shot_camera = shot_data.get("camera_angle") or "medium"
            # 安全获取 characters 列表
            character_names = shot_data.get("characters") or []
            if not isinstance(character_names, list):
                character_names = []

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
