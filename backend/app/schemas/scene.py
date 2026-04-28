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
