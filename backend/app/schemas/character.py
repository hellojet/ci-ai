from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class CharacterViewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    character_id: int
    # 生成占位时 image_url 可能为空
    image_url: Optional[str] = None
    view_type: Optional[str] = None
    sort_order: int
    status: str = "completed"
    error_message: Optional[str] = None
    # 本次生成是否参考了角色种子图
    use_seed_image: bool = False
    created_at: datetime


class CharacterOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: Optional[str] = None
    visual_prompt: Optional[str] = None
    seed_image_url: Optional[str] = None
    voice_config: Optional[dict] = None
    views: list[CharacterViewOut] = Field(default_factory=list)
    creator_id: int
    created_at: datetime
    updated_at: datetime


class GenerateViewsRequest(BaseModel):
    count: int = Field(ge=1, le=20)
    view_types: list[str]
    # 是否参考角色种子图；默认 False，向后兼容老前端
    use_seed_image: bool = False
