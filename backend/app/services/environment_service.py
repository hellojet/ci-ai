import asyncio
import base64
import logging
from typing import Optional

import httpx
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.environment import Environment
from app.services.qiniu_storage import upload_bytes
from app.services.settings_service import get_setting_value
from app.utils.pagination import paginate

logger = logging.getLogger(__name__)


async def get_environments(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
    keyword: Optional[str] = None,
) -> tuple[list[Environment], int]:
    query = select(Environment)
    if keyword:
        query = query.where(Environment.name.ilike(f"%{keyword}%"))
    query = query.order_by(Environment.id.desc())
    return await paginate(db, query, page, page_size)


async def get_environment(db: AsyncSession, environment_id: int) -> Environment:
    result = await db.execute(
        select(Environment).where(Environment.id == environment_id)
    )
    environment = result.scalar_one_or_none()
    if environment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Environment {environment_id} not found",
        )
    return environment


async def create_environment(
    db: AsyncSession,
    creator_id: int,
    name: str,
    description: Optional[str] = None,
    prompt: Optional[str] = None,
    base_image_url: Optional[str] = None,
) -> Environment:
    environment = Environment(
        name=name,
        description=description,
        prompt=prompt,
        base_image_url=base_image_url,
        creator_id=creator_id,
    )
    db.add(environment)
    await db.commit()
    await db.refresh(environment)
    return environment


async def update_environment(
    db: AsyncSession,
    environment_id: int,
    name: Optional[str] = None,
    description: Optional[str] = None,
    prompt: Optional[str] = None,
    base_image_url: Optional[str] = None,
) -> Environment:
    environment = await get_environment(db, environment_id)
    if name is not None:
        environment.name = name
    if description is not None:
        environment.description = description
    if prompt is not None:
        environment.prompt = prompt
    if base_image_url is not None:
        environment.base_image_url = base_image_url
    await db.commit()
    await db.refresh(environment)
    return environment


async def delete_environment(db: AsyncSession, environment_id: int) -> None:
    environment = await get_environment(db, environment_id)
    await db.delete(environment)
    await db.commit()


async def generate_environment_image(
    db: AsyncSession,
    environment_id: int,
) -> Environment:
    environment = await get_environment(db, environment_id)

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

    # 构造 prompt
    prompt = environment.prompt or environment.description or environment.name
    prompt = f"{prompt}，场景环境图，高质量，宽幅构图，电影感"

    # 调用图像生成 API（支持限流重试）
    max_retries = 3
    retry_delay = 5
    last_error = None

    for attempt in range(1, max_retries + 1):
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
                    "size": "1536x1024",
                    "quality": "low",
                    "output_format": "png",
                    "output_compression": 100,
                },
            )

        if response.status_code == 200:
            break

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
        logger.error("场景环境图像生成 API 返回错误: %s", last_error)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"图像生成 API 调用失败（已重试 {max_retries} 次）: {last_error}",
        )

    data = response.json()
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
        image_url = upload_bytes(image_bytes, extension="png", folder="environments")

    if not image_url:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="图像生成 API 返回数据中无 url 或 b64_json",
        )

    # 更新场景环境的 base_image_url
    environment.base_image_url = image_url
    await db.commit()
    await db.refresh(environment)

    logger.info("场景环境 %s 的基础图片生成成功: %s", environment_id, image_url)
    return environment
