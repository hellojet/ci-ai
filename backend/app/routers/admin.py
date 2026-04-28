"""管理员路由：用户管理。"""

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_admin
from app.models.user import User
from app.schemas.admin import UpdateCreditsRequest
from app.schemas.common import ApiResponse, PaginatedData
from app.services import admin_service

router = APIRouter(prefix="/admin", tags=["Admin"])


class UpdateRoleRequest(BaseModel):
    role: str


class UserAdminOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    role: str
    credits: int
    avatar_url: str | None = None
    created_at: datetime
    updated_at: datetime


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
