from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.schemas.scene import SceneOut
from app.schemas.script import ScriptOut


class StyleBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    prompt: Optional[str] = None

class UserBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: Optional[str] = None
    status: str
    style: Optional[StyleBrief] = None
    shots_per_image: int
    creator: UserBrief
    created_at: datetime
    updated_at: datetime


class ProjectDetailOut(ProjectOut):
    script: Optional[ScriptOut] = None
    scenes: list[SceneOut] = []


class CreateProjectRequest(BaseModel):
    name: str
    description: Optional[str] = None
    style_id: Optional[int] = None
    shots_per_image: int = 2


class UpdateProjectRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    style_id: Optional[int] = None
    shots_per_image: Optional[int] = None


