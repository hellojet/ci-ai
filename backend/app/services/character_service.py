import asyncio
import base64
import logging
from typing import Optional

import httpx
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.character import Character
from app.models.character_view import CharacterView
from app.services.qiniu_storage import upload_bytes
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
) -> None:
    character = await get_character(db, character_id)
    current_view_count = len(character.views)

    if current_view_count + count > MAX_VIEWS_PER_CHARACTER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"View limit exceeded: character already has {current_view_count} views, "
            f"requesting {count} more would exceed the maximum of {MAX_VIEWS_PER_CHARACTER}",
        )

    # 从系统设置中读取图像生成 API 配置（数据库优先，.env 兜底）
    endpoint = await get_setting_value(db, "api.image.endpoint")
    model = await get_setting_value(db, "api.image.model")
    api_key = await get_setting_value(db, "api.image.api_key")
    timeout = int(await get_setting_value(db, "api.image.timeout", "180"))

    if not endpoint or not api_key:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="图像生成 API 未配置，请在系统设置或 .env 中配置 endpoint 和 api_key。",
        )

    # 构造图像生成 prompt
    base_prompt = character.visual_prompt or character.description or character.name
    current_max_order = max((v.sort_order for v in character.views), default=-1)

    MAX_RETRIES = 3
    RETRY_DELAY_SECONDS = 5

    async def call_image_api(prompt: str) -> dict:
        """调用图像生成 API，支持限流自动重试。"""
        last_error = None
        for attempt in range(1, MAX_RETRIES + 1):
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(
                    endpoint,
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {api_key}",
                    },
                    json={
                        "prompt": prompt,
                        "model": model,
                        "n": 1,
                        "size": "1024x1024",
                        "quality": "low",
                        "output_format": "png",
                        "output_compression": 100,
                    },
                )

            if response.status_code == 200:
                return response.json()

            body_text = response.text[:500]
            is_rate_limited = (
                response.status_code == 429
                or "429" in body_text
                or "限流" in body_text
                or "EngineOverloaded" in body_text
                or "too many requests" in body_text.lower()
            )

            if is_rate_limited and attempt < MAX_RETRIES:
                logger.warning(
                    "图像生成 API 限流（第 %d/%d 次），%d 秒后重试... body=%s",
                    attempt, MAX_RETRIES, RETRY_DELAY_SECONDS, body_text,
                )
                await asyncio.sleep(RETRY_DELAY_SECONDS)
                continue

            last_error = f"status={response.status_code}, body={body_text}"
            logger.error("图像生成 API 返回错误: %s", last_error)
            break

        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"图像生成 API 调用失败（已重试 {MAX_RETRIES} 次）: {last_error}",
        )

    async def generate_single_view(view_type: str, order: int) -> CharacterView:
        """生成单张图片并保存到数据库。"""
        prompt = f"{base_prompt}，{view_type}视角，高质量，细节丰富"
        data = await call_image_api(prompt)

        image_data_list = data.get("data", [])
        if not image_data_list:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="图像生成 API 未返回有效图片数据",
            )

        image_item = image_data_list[0]
        image_url = image_item.get("url", "")

        # 如果返回的是 base64 编码的图片，上传到七牛云
        if not image_url and image_item.get("b64_json"):
            image_bytes = base64.b64decode(image_item["b64_json"])
            image_url = upload_bytes(image_bytes, extension="png", folder="views")

        if not image_url:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="图像生成 API 返回数据中无 url 或 b64_json",
            )

        view = CharacterView(
            character_id=character_id,
            image_url=image_url,
            view_type=view_type,
            sort_order=order,
        )
        db.add(view)
        # 每生成一张就提交，避免后续失败导致前面成功的也回滚
        await db.commit()
        return view

    # 逐个生成视图（避免并发过高被限流）
    generated_count = 0
    for idx, view_type in enumerate(view_types[:count]):
        try:
            await generate_single_view(view_type, current_max_order + 1 + idx)
            generated_count += 1
            logger.info("角色 %s 的 %s 视图生成成功 (%d/%d)", character_id, view_type, generated_count, count)
        except HTTPException:
            if generated_count > 0:
                logger.warning("已成功生成 %d/%d 张视图，剩余失败", generated_count, count)
            raise
        except Exception as exc:
            logger.exception("生成视图失败: character_id=%s, view_type=%s", character_id, view_type)
            if generated_count > 0:
                logger.warning("已成功生成 %d/%d 张视图，剩余失败", generated_count, count)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"已生成 {generated_count}/{count} 张，生成 {view_type} 视图时出错: {exc}",
            ) from exc


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
