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


class ShotVideoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    shot_id: int
    video_url: str
    source_image_id: Optional[int] = None
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
    locked_video_id: Optional[int] = None
    ref_environment_image_id: Optional[int] = None
    ref_character_view_id: Optional[int] = None
    ref_character_view_ids: Optional[list[int]] = None
    # 提示词模块开关 + 用户自定义提示词。None 表示"全部启用"（兼容旧分镜）
    prompt_modules_image: Optional[dict[str, bool]] = None
    prompt_modules_video: Optional[dict[str, bool]] = None
    custom_prompt_image: Optional[str] = None
    custom_prompt_video: Optional[str] = None
    video_url: Optional[str] = None
    audio_url: Optional[str] = None
    sort_order: int
    status: str
    characters: list[CharacterBrief] = Field(default_factory=list)
    images: list[ShotImageOut] = Field(default_factory=list)
    videos: list[ShotVideoOut] = Field(default_factory=list)
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
    ref_environment_image_id: Optional[int] = None
    ref_character_view_id: Optional[int] = None
    ref_character_view_ids: Optional[list[int]] = None
    # 提示词模块开关 + 自定义提示词。custom_prompt_* 传入 "" 视为清空（回到开关拼接模式）
    prompt_modules_image: Optional[dict[str, bool]] = None
    prompt_modules_video: Optional[dict[str, bool]] = None
    custom_prompt_image: Optional[str] = None
    custom_prompt_video: Optional[str] = None
    sort_order: Optional[int] = None


class ShotOrderItem(BaseModel):
    shot_id: int
    scene_id: int
    sort_order: int


class ReorderShotsRequest(BaseModel):
    shot_orders: list[ShotOrderItem]


class LockImageRequest(BaseModel):
    image_id: int


class LockVideoRequest(BaseModel):
    video_id: int


class PromptComponents(BaseModel):
    style: str = ""
    environment: str = ""
    characters: str = ""
    action: str = ""
    dialogue: str = ""
    camera: str = ""


class PromptPreviewResponse(BaseModel):
    """提示词预览。

    - prompt：最终用于喂给 AI 的字符串
    - components：每个模块的原始片段，供前端展示与开关 UI 使用
    - is_custom：True 表示当前用的是用户自定义提示词，开关已失效
    - modules：当前实际生效的开关状态（None 在响应里会展开为 dict）
    """
    prompt: str
    components: PromptComponents
    is_custom: bool = False
    modules: dict[str, bool] = Field(default_factory=dict)
