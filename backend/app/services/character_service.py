import logging
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.character import Character
from app.models.character_view import CharacterView
from app.services.settings_service import get_setting_value
from app.utils.pagination import paginate

logger = logging.getLogger(__name__)

MAX_VIEWS_PER_CHARACTER = 20


async def get_characters(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
    keyword: Optional[str] = None,
) -> tuple[list[Character], int]:
    query = select(Character).options(selectinload(Character.views))
    if keyword:
        query = query.where(Character.name.ilike(f"%{keyword}%"))
    query = query.order_by(Character.id.desc())
    return await paginate(db, query, page, page_size)


async def get_character(db: AsyncSession, character_id: int) -> Character:
    result = await db.execute(
        select(Character)
        .options(selectinload(Character.views))
        .where(Character.id == character_id)
    )
    character = result.scalar_one_or_none()
    if character is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Character {character_id} not found",
        )
    return character


async def create_character(
    db: AsyncSession,
    creator_id: int,
    name: str,
    description: Optional[str] = None,
    visual_prompt: Optional[str] = None,
    seed_image_url: Optional[str] = None,
) -> Character:
    character = Character(
        name=name,
        description=description,
        visual_prompt=visual_prompt,
        seed_image_url=seed_image_url,
        creator_id=creator_id,
    )
    db.add(character)
    await db.commit()
    await db.refresh(character)
    return await get_character(db, character.id)


async def update_character(
    db: AsyncSession,
    character_id: int,
    name: Optional[str] = None,
    description: Optional[str] = None,
    visual_prompt: Optional[str] = None,
    seed_image_url: Optional[str] = None,
) -> Character:
    character = await get_character(db, character_id)
    if name is not None:
        character.name = name
    if description is not None:
        character.description = description
    if visual_prompt is not None:
        character.visual_prompt = visual_prompt
    if seed_image_url is not None:
        character.seed_image_url = seed_image_url
    await db.commit()
    await db.refresh(character)
    return await get_character(db, character.id)


async def delete_character(db: AsyncSession, character_id: int) -> None:
    character = await get_character(db, character_id)
    await db.delete(character)
    await db.commit()


async def generate_views(
    db: AsyncSession,
    character_id: int,
    count: int,
    view_types: list[str],
    use_seed_image: bool = False,
) -> list[CharacterView]:
    """异步化：只落占位 view(status=queued) + 派发 Celery 任务，立即返回。

    - 校验配额、API 配置
    - 每张视图在数据库里先落一条 status=queued 的占位行（image_url 为空串占位）
    - use_seed_image=True 时，会在占位 view 上打标，worker 里会把角色 seed_image_url
      作为参考图传给图生图 API；种子图缺失时 worker 会自动降级为纯文生图
    - 把这些 view_id 交给 Celery worker 逐个调用图像 API 回填，状态按 queued → generating → completed/failed 流转
    - 返回刚创建的占位 view 列表，供前端立即渲染 loading 卡片
    """
    character = await get_character(db, character_id)
    current_view_count = len(character.views)

    if current_view_count + count > MAX_VIEWS_PER_CHARACTER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"View limit exceeded: character already has {current_view_count} views, "
                f"requesting {count} more would exceed the maximum of {MAX_VIEWS_PER_CHARACTER}"
            ),
        )

    # 校验 API 配置，避免派发后 worker 才报错
    endpoint = await get_setting_value(db, "api.image.endpoint")
    api_key = await get_setting_value(db, "api.image.api_key")
    if not endpoint or not api_key:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="图像生成 API 未配置，请在系统设置或 .env 中配置 endpoint 和 api_key。",
        )

    # use_seed_image=True 但种子图不存在时，记录一下但不拒绝请求（worker 里会降级并在 error_message 留痕）
    effective_use_seed = bool(use_seed_image and character.seed_image_url)
    if use_seed_image and not character.seed_image_url:
        logger.warning(
            "角色 %s 请求参考种子图生成，但 seed_image_url 为空，将降级为纯文生图",
            character_id,
        )

    # 逐个落占位 view，拿到持久化的 view_id 后派发任务
    current_max_order = max((v.sort_order for v in character.views), default=-1)
    effective_view_types = (view_types or [])[:count]
    # view_types 数量不够时补 None（让 worker 走默认 prompt）
    if len(effective_view_types) < count:
        effective_view_types = effective_view_types + [None] * (count - len(effective_view_types))

    placeholders: list[CharacterView] = []
    for idx, view_type in enumerate(effective_view_types):
        view = CharacterView(
            character_id=character_id,
            # SQLite 旧表 image_url 为 NOT NULL，用空串占位，生成完成后再回填
            image_url="",
            view_type=view_type,
            sort_order=current_max_order + 1 + idx,
            status="queued",
            use_seed_image=effective_use_seed,
        )
        db.add(view)
        placeholders.append(view)
    await db.commit()
    for v in placeholders:
        await db.refresh(v)

    # 延迟 import，避免循环引用（tasks 依赖 models）
    from app.tasks.generation_tasks import generate_character_view_task

    for v in placeholders:
        try:
            generate_character_view_task.delay(v.id)
        except Exception as exc:
            # 派发失败不影响其它，只把这一条标记 failed，供前端显示
            logger.exception("派发 generate_character_view_task 失败: view_id=%s", v.id)
            v.status = "failed"
            v.error_message = f"dispatch failed: {exc}"
    await db.commit()

    return placeholders


async def upload_view(
    db: AsyncSession,
    character_id: int,
    image_url: str,
    view_type: Optional[str] = None,
) -> CharacterView:
    """用户手动上传一张视图。image_url 必须是已经通过 /uploads 上传完成的 URL。"""
    character = await get_character(db, character_id)

    if len(character.views) >= MAX_VIEWS_PER_CHARACTER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"View limit exceeded (max {MAX_VIEWS_PER_CHARACTER}).",
        )
    if not image_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="image_url is required",
        )

    current_max_order = max((v.sort_order for v in character.views), default=-1)
    view = CharacterView(
        character_id=character_id,
        image_url=image_url,
        view_type=view_type,
        sort_order=current_max_order + 1,
        status="completed",
    )
    db.add(view)
    await db.commit()
    await db.refresh(view)
    return view


async def delete_view(
    db: AsyncSession,
    character_id: int,
    view_id: int,
) -> None:
    # Ensure the character exists
    await get_character(db, character_id)

    result = await db.execute(
        select(CharacterView).where(
            CharacterView.id == view_id,
            CharacterView.character_id == character_id,
        )
    )
    view = result.scalar_one_or_none()
    if view is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"View {view_id} not found for character {character_id}",
        )
    await db.delete(view)
    await db.commit()
