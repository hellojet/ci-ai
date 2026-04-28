from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.project import LockResponse, UserBrief
from app.services import lock_service

router = APIRouter(prefix="/projects/{project_id}", tags=["Project Lock"])


@router.post("/lock", response_model=ApiResponse[LockResponse])
async def acquire_lock(
    project_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取项目编辑锁。"""
    project = await lock_service.acquire_lock(db, project_id, user.id)
    return ApiResponse(
        data=LockResponse(
            locked=True,
            locked_by=UserBrief(id=user.id, username=user.username),
            lock_heartbeat=project.lock_heartbeat,
        )
    )


@router.post("/lock/heartbeat", response_model=ApiResponse)
async def heartbeat_lock(
    project_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """编辑锁心跳续期。"""
    await lock_service.heartbeat_lock(db, project_id, user.id)
    return ApiResponse(message="Heartbeat updated")


@router.delete("/lock", response_model=ApiResponse)
async def release_lock(
    project_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """释放编辑锁，管理员可强制释放。"""
    is_admin = getattr(user, "role", None) == "admin"
    await lock_service.release_lock(db, project_id, user.id, is_admin=is_admin)
    return ApiResponse(message="Lock released")
