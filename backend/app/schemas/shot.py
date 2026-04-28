from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class CharacterBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class ShotImageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    shot_id: int
    image_url: str
    is_locked: bool
    created_at: datetime


class ShotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    scene_id: int
    title: Optional[str] = None
    narration: Optional[str] = None
    dialogue: Optional[str] = None
    subtitle: Optional[str] = None
    action_description: Optional[str] = None
    camera_angle: Optional[str] = None
    generated_prompt: Optional[str] = None
    locked_image_id: Optional[int] = None
    video_url: Optional[str] = None
    audio_url: Optional[str] = None
    sort_order: int
    status: str
    characters: list[CharacterBrief] = Field(default_factory=list)
    images: list[ShotImageOut] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class CreateShotRequest(BaseModel):
    title: Optional[str] = None
    narration: Optional[str] = None
    dialogue: Optional[str] = None
    subtitle: Optional[str] = None
    action_description: Optional[str] = None
    camera_angle: Optional[str] = None
    character_ids: list[int] = Field(default_factory=list)
    sort_order: Optional[int] = 0


class UpdateShotRequest(BaseModel):
    title: Optional[str] = None
    narration: Optional[str] = None
    dialogue: Optional[str] = None
    subtitle: Optional[str] = None
    action_description: Optional[str] = None
    camera_angle: Optional[str] = None
    character_ids: Optional[list[int]] = None
    sort_order: Optional[int] = None


class ShotOrderItem(BaseModel):
    shot_id: int
    scene_id: int
    sort_order: int


class ReorderShotsRequest(BaseModel):
    shot_orders: list[ShotOrderItem]


class LockImageRequest(BaseModel):
    image_id: int


class PromptComponents(BaseModel):
    style: str = ""
    environment: str = ""
    characters: str = ""
    camera: str = ""
    action: str = ""


class PromptPreviewResponse(BaseModel):
    prompt: str
    components: PromptComponents
