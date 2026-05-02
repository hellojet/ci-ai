from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class EnvironmentImageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    environment_id: int
    image_url: str
    sort_order: int
    created_at: datetime


class EnvironmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: Optional[str] = None
    # 保留 base_image_url 兼容字段，新的多图存储在 images 数组里
    base_image_url: Optional[str] = None
    prompt: Optional[str] = None
    images: list[EnvironmentImageOut] = Field(default_factory=list)
    creator_id: int
    created_at: datetime
    updated_at: datetime
