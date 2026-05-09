"""生成任务服务层：创建任务、扣积分、派发 Celery 任务。"""

from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.generation_task import GenerationTask
from app.models.scene import Scene
from app.models.shot import Shot
from app.models.user import User
from app.services import image_models_service, video_models_service

CREDITS_MAP = {"image": 2, "video": 10, "audio": 5}


# 允许传入的参数白名单（按任务类型）。这里只做"白名单 + 类型清洗"，
# 真正的合法值校验交给适配器（adapter 更清楚自己接受什么 ratio/分辨率）。
_ALLOWED_IMAGE_PARAM_KEYS = {"ratio", "resolution"}
_ALLOWED_VIDEO_PARAM_KEYS = {"ratio", "resolution", "duration", "watermark"}


def _sanitize_params(task_type: str, params: dict[str, Any] | None) -> dict[str, Any] | None:
    """按白名单清洗前端传入的 params，避免脏数据进库 / 透传到上游 API。

    - audio：忽略
    - image：仅保留 ratio / resolution（字符串）
    - video：仅保留 ratio / resolution / duration / watermark（duration→int，watermark→bool）
    - 任何字段值为空字符串 / None 都丢弃，避免覆盖 worker 的默认值
    """
    if not params or not isinstance(params, dict):
        return None
    if task_type == "image":
        allowed = _ALLOWED_IMAGE_PARAM_KEYS
    elif task_type == "video":
        allowed = _ALLOWED_VIDEO_PARAM_KEYS
    else:
        return None

    cleaned: dict[str, Any] = {}
    for key, value in params.items():
        if key not in allowed:
            continue
        if value is None or value == "":
            continue
        if key == "duration":
            try:
                cleaned[key] = int(value)
            except (TypeError, ValueError):
                continue
        elif key == "watermark":
            cleaned[key] = bool(value)
        else:
            cleaned[key] = str(value)
    return cleaned or None


def _resolve_model_key(task_type: str, model_id: str | None) -> str | None:
    """给图像/视频任务解析实际要用的模型 id。

    - 图像/视频任务：优先取前端传入的 model_id；否则取后端默认模型；都没有时返回 None（走 .env 兜底）
      传了不存在的 model_id 则报 400，避免静默降级。
    - 其他任务（audio）：忽略 model_id，返回 None
    """
    if task_type == "image":
        svc = image_models_service
        kind = "image"
    elif task_type == "video":
        svc = video_models_service
        kind = "video"
    else:
        return None

    if model_id:
        # strict=True：传了 id 但找不到就直接报错，避免被静默回退到默认模型
        model = svc.get_model_by_id(model_id, strict=True)
        if model is None:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown {kind} model: {model_id}",
            )
        return model["id"]
    default_model = svc.get_default_model()
    return default_model["id"] if default_model else None


async def create_generation_task(
    db: AsyncSession,
    project_id: int,
    shot_id: int,
    task_type: str,
    user_id: int,
    model_id: str | None = None,
    params: dict[str, Any] | None = None,
) -> GenerationTask:
    """创建生成任务，扣减积分并派发 Celery 异步任务。"""
    result = await db.execute(select(Shot).where(Shot.id == shot_id))
    shot = result.scalar_one_or_none()
    if not shot:
        raise HTTPException(status_code=404, detail="Shot not found")

    credits_cost = CREDITS_MAP.get(task_type, 0)

    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.credits < credits_cost:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient credits. Required: {credits_cost}, Available: {user.credits}",
        )

    user.credits -= credits_cost

    resolved_model_key = _resolve_model_key(task_type, model_id)
    cleaned_params = _sanitize_params(task_type, params)

    task = GenerationTask(
        shot_id=shot_id,
        task_type=task_type,
        status="pending",
        credits_cost=credits_cost,
        created_by=user_id,
        model_key=resolved_model_key,
        params=cleaned_params,
    )
    db.add(task)
    await db.flush()

    from app.tasks.generation_tasks import (
        generate_audio_task,
        generate_image_task,
        generate_video_task,
    )

    celery_task_map = {
        "image": generate_image_task,
        "video": generate_video_task,
        "audio": generate_audio_task,
    }

    celery_result = celery_task_map[task_type].delay(task.id)
    task.celery_task_id = celery_result.id

    await db.commit()
    await db.refresh(task)
    return task


async def create_batch_generation_tasks(
    db: AsyncSession,
    project_id: int,
    task_type: str,
    user_id: int,
    model_id: str | None = None,
    params: dict[str, Any] | None = None,
) -> tuple[list[GenerationTask], list[dict], int]:
    """对项目下所有 shot 批量创建生成任务。

    规则：
    - image：所有 shot 都建任务
    - video：只对 locked_image_id 非空的 shot 建任务（没锁图就跳过，避免必然失败）
    - audio：所有 shot 都建任务
    返回 (tasks, skipped, total_credits_cost)。skipped 形如 [{"shot_id": x, "reason": "..."}]，
    用于前端提示哪些 shot 被跳过（当前前端不展示，但后续好扩展）。
    """
    # 1) 拉项目下所有 shot（按 scene 顺序、shot 顺序）
    shots_result = await db.execute(
        select(Shot)
        .join(Scene, Shot.scene_id == Scene.id)
        .where(Scene.project_id == project_id)
        .order_by(Scene.sort_order, Shot.sort_order)
    )
    shots = list(shots_result.scalars().all())
    if not shots:
        raise HTTPException(status_code=404, detail="No shots found in this project")

    # 2) 过滤出真正要建任务的 shot
    target_shots: list[Shot] = []
    skipped: list[dict] = []
    for shot in shots:
        if task_type == "video" and not shot.locked_image_id:
            skipped.append({"shot_id": shot.id, "reason": "no_locked_image"})
            continue
        target_shots.append(shot)

    if not target_shots:
        raise HTTPException(
            status_code=400,
            detail="No eligible shots. For video generation, please lock an image for each shot first.",
        )

    # 3) 一次性校验积分（按总数预扣，避免扣到一半失败）
    per_credits = CREDITS_MAP.get(task_type, 0)
    total_credits = per_credits * len(target_shots)

    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.credits < total_credits:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient credits. Required: {total_credits}, Available: {user.credits}",
        )
    user.credits -= total_credits

    # 4) 解析模型 key（一次解析复用给所有任务，避免重复校验）
    resolved_model_key = _resolve_model_key(task_type, model_id)
    cleaned_params = _sanitize_params(task_type, params)

    # 5) 批量建 GenerationTask
    tasks: list[GenerationTask] = []
    for shot in target_shots:
        task = GenerationTask(
            shot_id=shot.id,
            task_type=task_type,
            status="pending",
            credits_cost=per_credits,
            created_by=user_id,
            model_key=resolved_model_key,
            params=cleaned_params,
        )
        db.add(task)
        tasks.append(task)
    await db.flush()  # 拿到 task.id

    # 6) 派发 Celery 任务
    from app.tasks.generation_tasks import (
        generate_audio_task,
        generate_image_task,
        generate_video_task,
    )

    celery_task_map = {
        "image": generate_image_task,
        "video": generate_video_task,
        "audio": generate_audio_task,
    }
    celery_fn = celery_task_map[task_type]
    for task in tasks:
        celery_result = celery_fn.delay(task.id)
        task.celery_task_id = celery_result.id

    await db.commit()
    for task in tasks:
        await db.refresh(task)
    return tasks, skipped, total_credits


async def get_task(db: AsyncSession, task_id: int) -> GenerationTask:
    """查询单个生成任务。"""
    result = await db.execute(
        select(GenerationTask).where(GenerationTask.id == task_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


async def get_shot_tasks(db: AsyncSession, shot_id: int) -> list[GenerationTask]:
    """获取指定 shot 的全部生成任务（按创建时间倒序）。"""
    result = await db.execute(
        select(GenerationTask)
        .where(GenerationTask.shot_id == shot_id)
        .order_by(GenerationTask.created_at.desc())
    )
    return list(result.scalars().all())


async def retry_task(
    db: AsyncSession, task_id: int, user_id: int
) -> GenerationTask:
    """重试失败的生成任务。"""
    task = await get_task(db, task_id)
    if task.status != "failed":
        raise HTTPException(status_code=400, detail="Only failed tasks can be retried")

    credits_cost = CREDITS_MAP.get(task.task_type, 0)
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if not user or user.credits < credits_cost:
        raise HTTPException(status_code=400, detail="Insufficient credits")
    user.credits -= credits_cost

    task.status = "pending"
    task.error_message = None
    task.retry_count += 1

    from app.tasks.generation_tasks import (
        generate_audio_task,
        generate_image_task,
        generate_video_task,
    )

    celery_task_map = {
        "image": generate_image_task,
        "video": generate_video_task,
        "audio": generate_audio_task,
    }
    celery_result = celery_task_map[task.task_type].delay(task.id)
    task.celery_task_id = celery_result.id

    await db.commit()
    await db.refresh(task)
    return task
