from fastapi import HTTPException, status
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.scene import Scene
from app.models.shot import Shot
from app.models.shot_character import ShotCharacter
from app.models.shot_image import ShotImage
from app.models.shot_video import ShotVideo
from app.schemas.shot import (
    CreateShotRequest,
    PromptComponents,
    PromptPreviewResponse,
    ShotOrderItem,
    UpdateShotRequest,
)


async def _load_shot_with_relations(db: AsyncSession, shot_id: int) -> Shot:
    """Reload a shot with its characters and images relationships."""
    result = await db.execute(
        select(Shot)
        .options(selectinload(Shot.characters), selectinload(Shot.images))
        .where(Shot.id == shot_id)
    )
    shot = result.scalar_one_or_none()
    if shot is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Shot not found"
        )
    return shot


async def create_shot(
    db: AsyncSession, project_id: int, scene_id: int, data: CreateShotRequest
) -> Shot:
    # Verify scene belongs to project
    scene_result = await db.execute(
        select(Scene).where(Scene.id == scene_id, Scene.project_id == project_id)
    )
    if scene_result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Scene not found"
        )

    shot = Shot(
        scene_id=scene_id,
        title=data.title,
        narration=data.narration,
        dialogue=data.dialogue,
        subtitle=data.subtitle,
        action_description=data.action_description,
        camera_angle=data.camera_angle,
        sort_order=data.sort_order or 0,
        status="pending",
    )
    db.add(shot)
    await db.flush()

    # Create ShotCharacter associations
    for character_id in data.character_ids:
        shot_character = ShotCharacter(
            shot_id=shot.id, character_id=character_id
        )
        db.add(shot_character)

    await db.commit()
    return await _load_shot_with_relations(db, shot.id)


async def update_shot(
    db: AsyncSession, project_id: int, shot_id: int, data: UpdateShotRequest
) -> Shot:
    result = await db.execute(
        select(Shot)
        .join(Scene, Shot.scene_id == Scene.id)
        .where(Shot.id == shot_id, Scene.project_id == project_id)
    )
    shot = result.scalar_one_or_none()
    if shot is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Shot not found"
        )

    update_data = data.model_dump(exclude_unset=True)
    character_ids = update_data.pop("character_ids", None)

    for field, value in update_data.items():
        setattr(shot, field, value)

    # Update character associations if provided
    if character_ids is not None:
        await db.execute(
            delete(ShotCharacter).where(ShotCharacter.shot_id == shot_id)
        )
        for character_id in character_ids:
            shot_character = ShotCharacter(
                shot_id=shot_id, character_id=character_id
            )
            db.add(shot_character)

    await db.commit()
    # 清空 session 缓存，避免 selectinload 返回 identity map 里的旧 characters 列表
    db.expire_all()
    return await _load_shot_with_relations(db, shot_id)


async def delete_shot(
    db: AsyncSession, project_id: int, shot_id: int
) -> None:
    result = await db.execute(
        select(Shot)
        .join(Scene, Shot.scene_id == Scene.id)
        .where(Shot.id == shot_id, Scene.project_id == project_id)
    )
    shot = result.scalar_one_or_none()
    if shot is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Shot not found"
        )

    await db.execute(
        delete(ShotCharacter).where(ShotCharacter.shot_id == shot_id)
    )
    await db.delete(shot)
    await db.commit()


async def reorder_shots(
    db: AsyncSession, project_id: int, shot_orders: list[ShotOrderItem]
) -> None:
    for item in shot_orders:
        # Support cross-scene moves by also updating scene_id
        await db.execute(
            update(Shot)
            .where(Shot.id == item.shot_id)
            .values(scene_id=item.scene_id, sort_order=item.sort_order)
        )
    await db.commit()


# 提示词模块的统一定义：键 + 默认开关 + 拼接顺序
PROMPT_MODULE_KEYS = ("style", "environment", "characters", "action", "dialogue", "camera")
DEFAULT_PROMPT_MODULES: dict[str, bool] = {key: True for key in PROMPT_MODULE_KEYS}


def _normalize_modules(raw: dict | None) -> dict[str, bool]:
    """把库里存的 modules 字典补齐成完整的 6 键开关；None 视为全开（兼容旧数据）。"""
    if not raw:
        return dict(DEFAULT_PROMPT_MODULES)
    return {key: bool(raw.get(key, True)) for key in PROMPT_MODULE_KEYS}


async def _collect_prompt_components(
    db: AsyncSession, project_id: int, shot: Shot
) -> PromptComponents:
    """汇集 shot 的所有提示词原料（不应用开关）。"""
    # Load scene with environment
    scene_result = await db.execute(
        select(Scene)
        .options(selectinload(Scene.environment))
        .where(Scene.id == shot.scene_id)
    )
    scene = scene_result.scalar_one()

    # Load project with style
    from app.models.project import Project
    project_result = await db.execute(
        select(Project).where(Project.id == project_id)
    )
    project = project_result.scalar_one_or_none()

    style_prompt = ""
    if project and project.style_id:
        from app.models.style import Style
        style_result = await db.execute(
            select(Style).where(Style.id == project.style_id)
        )
        style_obj = style_result.scalar_one_or_none()
        if style_obj:
            style_prompt = style_obj.prompt or ""

    environment_prompt = ""
    if scene.environment:
        environment_prompt = scene.environment.prompt or scene.environment.name

    characters_prompt = ", ".join(
        char.visual_prompt or char.name for char in shot.characters
    )

    return PromptComponents(
        style=style_prompt,
        environment=environment_prompt,
        characters=characters_prompt,
        action=shot.action_description or "",
        dialogue=shot.dialogue or "",
        camera=shot.camera_angle or "",
    )


def _assemble_prompt_from_modules(
    components: PromptComponents, modules: dict[str, bool]
) -> str:
    """按 PROMPT_MODULE_KEYS 顺序，结合开关把 components 拼成一段提示词。"""
    parts: list[str] = []
    for key in PROMPT_MODULE_KEYS:
        if not modules.get(key, True):
            continue
        value = getattr(components, key, "") or ""
        if not value:
            continue
        # camera 给个语义前缀，让模型知道这是机位信息而非主体描述
        if key == "camera":
            parts.append(f"camera: {value}")
        elif key == "dialogue":
            # dialogue 加引号，避免和动作描述粘在一起被模型误读
            parts.append(f'dialogue: "{value}"')
        else:
            parts.append(value)
    return ", ".join(parts)


async def get_shot_prompt(
    db: AsyncSession,
    project_id: int,
    shot_id: int,
    prompt_type: str = "image",
) -> PromptPreviewResponse:
    """生成 shot 的提示词预览。

    - prompt_type: "image" 或 "video"，决定读哪一套 modules / custom_prompt
    - 优先级：custom_prompt_<type> 非空 → 直接返回（is_custom=True）
              否则 → 按 modules 开关拼接 components
    """
    if prompt_type not in ("image", "video"):
        raise HTTPException(status_code=400, detail="prompt_type must be 'image' or 'video'")

    result = await db.execute(
        select(Shot)
        .options(selectinload(Shot.characters))
        .join(Scene, Shot.scene_id == Scene.id)
        .where(Shot.id == shot_id, Scene.project_id == project_id)
    )
    shot = result.scalar_one_or_none()
    if shot is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Shot not found"
        )

    components = await _collect_prompt_components(db, project_id, shot)

    custom_prompt = (
        shot.custom_prompt_image if prompt_type == "image" else shot.custom_prompt_video
    )
    raw_modules = (
        shot.prompt_modules_image if prompt_type == "image" else shot.prompt_modules_video
    )
    modules = _normalize_modules(raw_modules)

    if custom_prompt and custom_prompt.strip():
        return PromptPreviewResponse(
            prompt=custom_prompt,
            components=components,
            is_custom=True,
            modules=modules,
        )

    full_prompt = _assemble_prompt_from_modules(components, modules)
    return PromptPreviewResponse(
        prompt=full_prompt,
        components=components,
        is_custom=False,
        modules=modules,
    )


async def lock_image(
    db: AsyncSession, project_id: int, shot_id: int, image_id: int
) -> None:
    # Verify shot belongs to project
    result = await db.execute(
        select(Shot)
        .join(Scene, Shot.scene_id == Scene.id)
        .where(Shot.id == shot_id, Scene.project_id == project_id)
    )
    shot = result.scalar_one_or_none()
    if shot is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Shot not found"
        )

    # Verify image belongs to this shot
    image_result = await db.execute(
        select(ShotImage).where(
            ShotImage.id == image_id, ShotImage.shot_id == shot_id
        )
    )
    image = image_result.scalar_one_or_none()
    if image is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image not found for this shot",
        )

    # Unlock all images for this shot first
    await db.execute(
        update(ShotImage)
        .where(ShotImage.shot_id == shot_id)
        .values(is_locked=False)
    )

    # Lock the selected image
    image.is_locked = True
    shot.locked_image_id = image_id
    shot.status = "image_locked"

    await db.commit()


async def lock_video(
    db: AsyncSession, project_id: int, shot_id: int, video_id: int
) -> None:
    """锁定某条候选视频作为最终稿。

    - 将该视频标为 is_locked=True，同 shot 下其他视频全部 is_locked=False
    - 回写 shot.locked_video_id 与 shot.video_url（让 Preview 等老逻辑直接拿到最新的 URL）
    - 将 shot.status 置为 completed（视频已锁 = 全流程完成）
    """
    result = await db.execute(
        select(Shot)
        .join(Scene, Shot.scene_id == Scene.id)
        .where(Shot.id == shot_id, Scene.project_id == project_id)
    )
    shot = result.scalar_one_or_none()
    if shot is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Shot not found"
        )

    video_result = await db.execute(
        select(ShotVideo).where(
            ShotVideo.id == video_id, ShotVideo.shot_id == shot_id
        )
    )
    video = video_result.scalar_one_or_none()
    if video is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Video not found for this shot",
        )

    await db.execute(
        update(ShotVideo)
        .where(ShotVideo.shot_id == shot_id)
        .values(is_locked=False)
    )
    video.is_locked = True
    shot.locked_video_id = video_id
    shot.video_url = video.video_url
    shot.status = "completed"

    await db.commit()


async def upload_audio(
    db: AsyncSession, project_id: int, shot_id: int, audio_url: str
) -> None:
    result = await db.execute(
        select(Shot)
        .join(Scene, Shot.scene_id == Scene.id)
        .where(Shot.id == shot_id, Scene.project_id == project_id)
    )
    shot = result.scalar_one_or_none()
    if shot is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Shot not found"
        )

    shot.audio_url = audio_url
    await db.commit()
