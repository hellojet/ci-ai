from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class CharacterViewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    character_id: int
    image_url: str
    view_type: Optional[str] = None
    sort_order: int
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
