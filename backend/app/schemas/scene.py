from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.shot import ShotOut


class EnvironmentBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class SceneOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    title: Optional[str] = None
    description_prompt: Optional[str] = None
    sort_order: int
    # 前端 ShotEditor 需要用 environment_id 判断"场景是否已关联"；
    # 之前仅返回 environment 嵌套对象，遗漏了这个扁平字段导致关联后前端看不到。
    environment_id: Optional[int] = None
    environment: Optional[EnvironmentBrief] = None
    shots: list[ShotOut] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class CreateSceneRequest(BaseModel):
    title: str
    description_prompt: Optional[str] = None
    environment_id: Optional[int] = None
    sort_order: Optional[int] = 0


class UpdateSceneRequest(BaseModel):
    title: Optional[str] = None
    description_prompt: Optional[str] = None
    environment_id: Optional[int] = None


class SceneOrderItem(BaseModel):
    scene_id: int
    sort_order: int


class ReorderScenesRequest(BaseModel):
    scene_orders: list[SceneOrderItem]
