"""生成任务服务层：创建任务、扣积分、派发 Celery 任务。"""

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.generation_task import GenerationTask
from app.models.shot import Shot
from app.models.user import User

CREDITS_MAP = {"image": 2, "video": 10, "audio": 5}


async def create_generation_task(
    db: AsyncSession,
    project_id: int,
    shot_id: int,
    task_type: str,
    user_id: int,
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

    task = GenerationTask(
        shot_id=shot_id,
        task_type=task_type,
        status="pending",
        credits_cost=credits_cost,
        created_by=user_id,
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
