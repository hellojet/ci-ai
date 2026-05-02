"""系统设置路由。

- GET /settings：已登录用户均可查看（用于前端显示并发配额等信息）。
- PUT /settings：仅管理员可修改。
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_admin
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.settings import (
    SettingOut,
    SettingsListResponse,
    UpdateSettingsRequest,
)
from app.services import settings_service

router = APIRouter(prefix="/settings", tags=["Settings"])


@router.get("", response_model=ApiResponse[SettingsListResponse])
async def get_settings(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    merged = await settings_service.get_all_settings_merged(db)
    items = [
        SettingOut(
            key=item["key"],
            value=item["value"],
            source=item["source"],
            updated_at=item["updated_at"],
        )
        for item in merged
    ]
    return ApiResponse(data=SettingsListResponse(items=items))


@router.put("", response_model=ApiResponse[SettingsListResponse])
async def update_settings(
    body: UpdateSettingsRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    updated = await settings_service.update_settings(db, body.settings, admin.id)
    items = [
        SettingOut(
            key=s.key,
            value=s.value.get("value") if isinstance(s.value, dict) else s.value,
            updated_at=s.updated_at,
        )
        for s in updated
    ]
    return ApiResponse(data=SettingsListResponse(items=items))
