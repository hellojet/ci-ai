import asyncio
import base64
import logging
from typing import Optional

import httpx
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.style import Style
from app.services.qiniu_storage import upload_bytes
from app.services.settings_service import get_setting_value
from app.utils.pagination import paginate

logger = logging.getLogger(__name__)


async def get_styles(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[Style], int]:
    query = select(Style).order_by(Style.id.desc())
    return await paginate(db, query, page, page_size)


async def get_style(db: AsyncSession, style_id: int) -> Style:
    result = await db.execute(select(Style).where(Style.id == style_id))
    style = result.scalar_one_or_none()
    if style is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Style {style_id} not found",
        )
    return style


async def create_style(
    db: AsyncSession,
    creator_id: int,
    name: str,
    prompt: str,
    reference_image_url: Optional[str] = None,
) -> Style:
    style = Style(
        name=name,
        prompt=prompt,
        reference_image_url=reference_image_url,
        creator_id=creator_id,
    )
    db.add(style)
    await db.commit()
    await db.refresh(style)
    return style


async def update_style(
    db: AsyncSession,
    style_id: int,
    name: Optional[str] = None,
    prompt: Optional[str] = None,
    reference_image_url: Optional[str] = None,
) -> Style:
    style = await get_style(db, style_id)
    if name is not None:
        style.name = name
    if prompt is not None:
        style.prompt = prompt
    if reference_image_url is not None:
        style.reference_image_url = reference_image_url
    await db.commit()
    await db.refresh(style)
    return style


async def delete_style(db: AsyncSession, style_id: int) -> None:
    style = await get_style(db, style_id)
    await db.delete(style)
    await db.commit()


async def generate_style_image(
    db: AsyncSession,
    style_id: int,
) -> Style:
    """根据风格的 prompt 生成参考图片。"""
    style = await get_style(db, style_id)

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

    prompt = f"{style.prompt}，风格参考图，高质量，艺术感"

    max_retries = 10
    last_error: Optional[str] = None
    response: Optional[httpx.Response] = None

    for attempt in range(1, max_retries + 1):
        # 指数退避：5s, 8s, 13s, 20s, 30s, ...，封顶 60s
        retry_delay = min(60, int(5 * (1.6 ** (attempt - 1))))
        try:
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
        except (httpx.ReadError, httpx.ConnectError, httpx.RemoteProtocolError,
                httpx.ReadTimeout, httpx.ConnectTimeout, httpx.WriteError) as exc:
            last_error = f"network error: {type(exc).__name__}: {exc}"
            logger.warning(
                "图像生成 API 网络错误（第 %d/%d 次）：%s，%d 秒后重试...",
                attempt, max_retries, last_error, retry_delay,
            )
            if attempt < max_retries:
                await asyncio.sleep(retry_delay)
                continue
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"图像生成 API 网络异常（已重试 {max_retries} 次）: {last_error}",
            )

        if response.status_code == 200:
            # 兜底：AI 网关偶尔返回 200 但 body 为空或非 JSON，按限流策略重试
            try:
                data = response.json()
                break
            except Exception as json_exc:
                body_text = response.text[:500]
                last_error = f"200 but invalid json: {json_exc}, body={body_text!r}"
                if attempt < max_retries:
                    logger.warning(
                        "风格图像生成 API 返回 200 但 body 解析失败（第 %d/%d 次），%d 秒后重试... %s",
                        attempt, max_retries, retry_delay, last_error,
                    )
                    await asyncio.sleep(retry_delay)
                    continue
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"图像生成 API 返回无效 JSON（已重试 {max_retries} 次）: {last_error}",
                )

        body_text = response.text[:500]
        is_rate_limited = (
            response.status_code == 429
            or "429" in body_text
            or "限流" in body_text
            or "EngineOverloaded" in body_text
            or "too many requests" in body_text.lower()
        )

        if is_rate_limited and attempt < max_retries:
            logger.warning(
                "图像生成 API 限流（第 %d/%d 次），%d 秒后重试...",
                attempt, max_retries, retry_delay,
            )
            await asyncio.sleep(retry_delay)
            continue

        last_error = f"status={response.status_code}, body={body_text}"
        logger.error("风格图像生成 API 返回错误: %s", last_error)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"图像生成 API 调用失败（已重试 {max_retries} 次）: {last_error}",
        )

    assert response is not None
    image_data_list = data.get("data", [])
    if not image_data_list:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="图像生成 API 未返回有效图片数据",
        )

    image_item = image_data_list[0]
    image_url = image_item.get("url", "")

    if not image_url and image_item.get("b64_json"):
        image_bytes = base64.b64decode(image_item["b64_json"])
        image_url = upload_bytes(image_bytes, extension="png", folder="styles")

    if not image_url:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="图像生成 API 返回数据中无 url 或 b64_json",
        )

    style.reference_image_url = image_url
    await db.commit()
    await db.refresh(style)

    logger.info("风格 %s 的参考图片生成成功: %s", style_id, image_url)
    return style
