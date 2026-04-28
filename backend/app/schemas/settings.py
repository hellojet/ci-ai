from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class SettingOut(BaseModel):
    key: str
    value: Any
    updated_at: Optional[datetime] = None


class SettingItem(BaseModel):
    key: str
    value: Any


class UpdateSettingsRequest(BaseModel):
    settings: list[SettingItem]


class SettingsListResponse(BaseModel):
    items: list[SettingOut]
