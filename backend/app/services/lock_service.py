from datetime import datetime, timezone, tzinfo

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.project import Project

settings = get_settings()


def _ensure_aware(dt: datetime) -> datetime:
    """确保 datetime 带有时区信息（SQLite 存储的时间戳可能是 naive 的）。"""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


async def acquire_lock(
    db: AsyncSession,
    project_id: int,
    user_id: int,
) -> Project:
    """
    获取项目编辑锁。

    - 如果项目已被其他用户锁定且心跳未超时，返回 409 冲突。
    - 如果锁已过期或无锁，设置 locked_by 和 lock_heartbeat。
    """
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()

    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    if project.locked_by is not None and project.locked_by != user_id:
        if project.lock_heartbeat:
            heartbeat = _ensure_aware(project.lock_heartbeat)
            elapsed = (datetime.now(timezone.utc) - heartbeat).total_seconds()
            if elapsed <= settings.lock_heartbeat_timeout_seconds:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Project is currently locked by another user",
                )

    project.locked_by = user_id
    project.lock_heartbeat = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(project)
    return project


async def heartbeat_lock(
    db: AsyncSession,
    project_id: int,
    user_id: int,
) -> None:
    """续期编辑锁心跳。"""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()

    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    if project.locked_by != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not hold the edit lock for this project",
        )

    project.lock_heartbeat = datetime.now(timezone.utc)
    await db.commit()


async def release_lock(
    db: AsyncSession,
    project_id: int,
    user_id: int,
    is_admin: bool = False,
) -> None:
    """
    释放编辑锁。

    - 管理员可以强制释放任何锁。
    - 普通用户只能释放自己持有的锁。
    """
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()

    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    if not is_admin and project.locked_by != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not hold the edit lock for this project",
        )

    project.locked_by = None
    project.lock_heartbeat = None
    await db.commit()
