import logging
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.environment import Environment
from app.models.environment_image import EnvironmentImage
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
    seed_image_url: Optional[str] = None,
) -> Environment:
    environment = Environment(
        name=name,
        description=description,
        prompt=prompt,
        base_image_url=base_image_url,
        seed_image_url=seed_image_url,
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
    seed_image_url: Optional[str] = None,
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
    if seed_image_url is not None:
        environment.seed_image_url = seed_image_url
    await db.commit()
    await db.refresh(environment)
    return environment


async def delete_environment(db: AsyncSession, environment_id: int) -> None:
    environment = await get_environment(db, environment_id)
    await db.delete(environment)
    await db.commit()


async def generate_environment_images(
    db: AsyncSession,
    environment_id: int,
    count: int,
    view_types: list[str],
    use_seed_image: bool = False,
    model_id: Optional[str] = None,
) -> list[EnvironmentImage]:
    """异步化：只落占位 image(status=queued) + 派发 Celery 任务，立即返回。

    对齐 character_service.generate_views 的设计：
    - 校验配额（最多 20 张）、模型配置
    - 每张图在数据库里先落一条 status=queued 的占位行（image_url 为空串占位）
    - use_seed_image=True 时在占位行打标，worker 把 environment.seed_image_url 作为参考图传给图生图 API；
      种子图缺失时 worker 自动降级为纯文生图
    - model_id 指定本次要用的图像模型（AI_IMAGE_MODELS 里的某一项 id），不传则走默认模型
    - 把 image_id 交给 Celery worker 逐个调用图像 API 回填，状态按 queued → generating → completed/failed 流转
    - 返回刚创建的占位 image 列表，供前端立即渲染 loading 卡片
    """
    environment = await get_environment(db, environment_id)
    current_count = len(environment.images)

    if current_count + count > MAX_IMAGES_PER_ENVIRONMENT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"场景图片已达上限：已有 {current_count} 张，再生成 {count} 张将超过 "
                f"{MAX_IMAGES_PER_ENVIRONMENT} 张上限。"
            ),
        )

    # 解析本次要用的图像模型：优先走 AI_IMAGE_MODELS 清单，回落到 .env 默认
    resolved_model_key = _resolve_image_model_key(model_id)

    # use_seed_image=True 但种子图不存在时，记录一下但不拒绝请求（worker 里会降级并在 error_message 留痕）
    effective_use_seed = bool(use_seed_image and environment.seed_image_url)
    if use_seed_image and not environment.seed_image_url:
        logger.warning(
            "场景 %s 请求参考种子图生成，但 seed_image_url 为空，将降级为纯文生图",
            environment_id,
        )

    # 逐个落占位 image，拿到持久化的 image_id 后派发任务
    current_max_order = max((i.sort_order for i in environment.images), default=-1)
    effective_view_types = (view_types or [])[:count]
    if len(effective_view_types) < count:
        # view_types 数量不够时补 None（让 worker 走默认 prompt）
        effective_view_types = effective_view_types + [None] * (count - len(effective_view_types))

    placeholders: list[EnvironmentImage] = []
    for idx, view_type in enumerate(effective_view_types):
        image = EnvironmentImage(
            environment_id=environment_id,
            image_url="",  # 占位，worker 回填
            view_type=view_type,
            sort_order=current_max_order + 1 + idx,
            status="queued",
            use_seed_image=effective_use_seed,
            model_key=resolved_model_key,
        )
        db.add(image)
        placeholders.append(image)
    await db.commit()
    for img in placeholders:
        await db.refresh(img)

    # 延迟 import，避免循环引用（tasks 依赖 models）
    from app.tasks.generation_tasks import generate_environment_image_task

    for img in placeholders:
        try:
            generate_environment_image_task.delay(img.id)
        except Exception as exc:
            logger.exception("派发 generate_environment_image_task 失败: image_id=%s", img.id)
            img.status = "failed"
            img.error_message = f"dispatch failed: {exc}"
    await db.commit()

    return placeholders


def _resolve_image_model_key(model_id: Optional[str]) -> Optional[str]:
    """解析并校验图像模型 id。

    - 传了 model_id：必须在 AI_IMAGE_MODELS 清单里找到，否则 400
    - 没传 model_id：优先用默认模型（AI_IMAGE_MODELS 中 default=true 的那条）
    - 清单完全为空时返回 None，worker 会回落到 .env 的 AI_IMAGE_* 配置（仅支持 images_generations 协议）
    """
    from app.services import image_models_service

    if model_id:
        # strict=True：找不到就直接报错，避免把用户的显式选择偷偷回退成默认模型
        model = image_models_service.get_model_by_id(model_id, strict=True)
        if model is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"未知的图像模型：{model_id}，请先在 AI_IMAGE_MODELS 环境变量中配置。",
            )
        return model["id"]

    default_model = image_models_service.get_default_model()
    if default_model is not None:
        return default_model["id"]
    return None


async def upload_environment_image(
    db: AsyncSession,
    environment_id: int,
    image_url: str,
    view_type: Optional[str] = None,
) -> EnvironmentImage:
    """用户手动上传一张场景图。image_url 必须是已通过 /uploads 上传完成的 URL。"""
    environment = await get_environment(db, environment_id)

    if len(environment.images) >= MAX_IMAGES_PER_ENVIRONMENT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"场景图片已达上限（最多 {MAX_IMAGES_PER_ENVIRONMENT} 张）。",
        )
    if not image_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="image_url is required",
        )

    current_max_order = max((i.sort_order for i in environment.images), default=-1)
    new_image = EnvironmentImage(
        environment_id=environment_id,
        image_url=image_url,
        view_type=view_type,
        sort_order=current_max_order + 1,
        status="completed",
    )
    db.add(new_image)

    # 首次有图时，同步写入 environment.base_image_url 兼容旧前端
    if not environment.base_image_url:
        environment.base_image_url = image_url

    await db.commit()
    await db.refresh(new_image)
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
