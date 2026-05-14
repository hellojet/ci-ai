"""管理员路由：用户管理 + 试用申请管理。"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_admin
from app.models.user import User
from app.schemas.admin import UpdateCreditsRequest
from app.schemas.common import ApiResponse, PaginatedData
from app.schemas.trial_request import TrialRequestOut, TrialRequestUpdate
from app.services import admin_service, trial_request_service
from app.utils.security import hash_password

router = APIRouter(prefix="/admin", tags=["Admin"])


class UpdateRoleRequest(BaseModel):
    role: str


class CreateUserRequest(BaseModel):
    username: str
    password: str
    role: str = "user"
    credits: int = 1000


class UserAdminOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    role: str
    credits: int
    avatar_url: str | None = None
    created_at: datetime
    updated_at: datetime


@router.post("/users", response_model=ApiResponse[UserAdminOut])
async def create_user(
    body: CreateUserRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Admin 创建新用户（公开注册已关闭，仅此入口可新增用户）。"""
    result = await db.execute(select(User).where(User.username == body.username))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Username already exists")

    user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        role=body.role,
        credits=body.credits,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return ApiResponse(data=UserAdminOut.model_validate(user))


@router.get("/users", response_model=ApiResponse[PaginatedData[UserAdminOut]])
async def get_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    users, total = await admin_service.get_users(db, page, page_size)
    items = [UserAdminOut.model_validate(u) for u in users]
    return ApiResponse(data=PaginatedData(total=total, items=items))


@router.put(
    "/users/{user_id}/credits",
    response_model=ApiResponse[UserAdminOut],
)
async def update_user_credits(
    user_id: int,
    body: UpdateCreditsRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = await admin_service.update_user_credits(db, user_id, body.delta)
    return ApiResponse(data=UserAdminOut.model_validate(user))


@router.put(
    "/users/{user_id}/role",
    response_model=ApiResponse[UserAdminOut],
)
async def update_user_role(
    user_id: int,
    body: UpdateRoleRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = await admin_service.update_user_role(db, user_id, body.role)
    return ApiResponse(data=UserAdminOut.model_validate(user))


@router.delete("/users/{user_id}", response_model=ApiResponse)
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    await admin_service.delete_user(db, user_id)
    return ApiResponse(message="User deleted")


# ── 试用申请管理 ────────────────────────────────────────────────


@router.get(
    "/trial-requests",
    response_model=ApiResponse[PaginatedData[TrialRequestOut]],
)
async def get_trial_requests(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = Query(None),
    keyword: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    items, total = await trial_request_service.list_(
        db, page, page_size, status, keyword
    )
    out = [TrialRequestOut.model_validate(r) for r in items]
    return ApiResponse(data=PaginatedData(total=total, items=out))


@router.put(
    "/trial-requests/{request_id}",
    response_model=ApiResponse[TrialRequestOut],
)
async def update_trial_request(
    request_id: int,
    body: TrialRequestUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    record = await trial_request_service.update(db, request_id, body)
    return ApiResponse(data=TrialRequestOut.model_validate(record))


@router.delete("/trial-requests/{request_id}", response_model=ApiResponse)
async def delete_trial_request(
    request_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    await trial_request_service.delete(db, request_id)
    return ApiResponse(message="Trial request deleted")
