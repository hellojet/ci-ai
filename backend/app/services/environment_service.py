import asyncio
import base64
import logging
from typing import Optional

import httpx
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.environment import Environment
from app.models.environment_image import EnvironmentImage
from app.services.qiniu_storage import upload_bytes
from app.services.settings_service import get_setting_value
from app.utils.pagination import paginate

MAX_IMAGES_PER_ENVIRONMENT = 20

logger = logging.getLogger(__name__)


async def get_environments(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
    keyword: Optional[str] = None,
) -> tuple[list[Environment], int]:
    query = select(Environment).options(selectinload(Environment.images))
    if keyword:
        query = query.where(Environment.name.ilike(f"%{keyword}%"))
    query = query.order_by(Environment.id.desc())
    return await paginate(db, query, page, page_size)


async def get_environment(db: AsyncSession, environment_id: int) -> Environment:
    result = await db.execute(
        select(Environment)
        .options(selectinload(Environment.images))
        .where(Environment.id == environment_id)
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
) -> EnvironmentImage:
    """为场景资产生成一张新图片，追加到 environment.images 列表中（不覆盖已有图片）。

    对应测试用例 TC-3.2（首次生成）、TC-3.3（再次生成 append）。
    上限：同一 environment 最多 20 张图片。
    """
    environment = await get_environment(db, environment_id)
    current_count = len(environment.images)

    if current_count >= MAX_IMAGES_PER_ENVIRONMENT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"场景图片已达上限：{MAX_IMAGES_PER_ENVIRONMENT} 张，"
                "请先删除已有图片后再生成。"
            ),
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

    # 构造 prompt；多次生成时在 prompt 中加入序号提示以增加多样性
    base_prompt = environment.prompt or environment.description or environment.name
    prompt = f"{base_prompt}，场景环境图，高质量，宽幅构图，电影感，视角 {current_count + 1}"

    # 调用图像生成 API（支持限流 + 网络异常重试，10 次 + 指数退避封顶 60s）
    max_retries = 10
    last_error: Optional[str] = None
    response: Optional[httpx.Response] = None

    for attempt in range(1, max_retries + 1):
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
                        "size": "1536x1024",
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
                        "场景环境图像生成 API 返回 200 但 body 解析失败（第 %d/%d 次），%d 秒后重试... %s",
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
        logger.error("场景环境图像生成 API 返回错误: %s", last_error)
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

    # 如果返回的是 base64 编码的图片，上传到七牛云
    if not image_url and image_item.get("b64_json"):
        image_bytes = base64.b64decode(image_item["b64_json"])
        image_url = upload_bytes(image_bytes, extension="png", folder="environments")

    if not image_url:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="图像生成 API 返回数据中无 url 或 b64_json",
        )

    # 以 append 方式新增一张图片记录
    new_image = EnvironmentImage(
        environment_id=environment_id,
        image_url=image_url,
        sort_order=current_count,
    )
    db.add(new_image)

    # 首次生成时，同步写入 environment.base_image_url 便于兼容旧前端
    if current_count == 0:
        environment.base_image_url = image_url

    await db.commit()
    await db.refresh(new_image)

    logger.info(
        "场景环境 %s 新增图片成功：image_id=%s, url=%s, 总数=%s",
        environment_id, new_image.id, image_url, current_count + 1,
    )
    return new_image


async def delete_environment_image(
    db: AsyncSession,
    environment_id: int,
    image_id: int,
) -> None:
    """删除某场景资产下的一张图片。"""
    result = await db.execute(
        select(EnvironmentImage).where(
            EnvironmentImage.id == image_id,
            EnvironmentImage.environment_id == environment_id,
        )
    )
    image = result.scalar_one_or_none()
    if image is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"EnvironmentImage {image_id} not found for environment {environment_id}",
        )

    # 清理所有引用了该图片的分镜 ref_environment_image_id
    from app.models.shot import Shot
    from sqlalchemy import update as sql_update

    await db.execute(
        sql_update(Shot)
        .where(Shot.ref_environment_image_id == image_id)
        .values(ref_environment_image_id=None)
    )

    await db.delete(image)
    await db.commit()
