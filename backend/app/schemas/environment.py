from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class EnvironmentImageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    environment_id: int
    # 生成占位时 image_url 可能为空串，前端据此显示加载态
    image_url: str = ""
    view_type: Optional[str] = None
    sort_order: int
    # 生命周期：queued → generating → completed / failed；老数据默认 completed
    status: str = "completed"
    error_message: Optional[str] = None
    # 本次生成是否参考了场景的种子图
    use_seed_image: bool = False
    # 本次生成使用的图像模型 id（AI_IMAGE_MODELS 中的某一项）
    model_key: Optional[str] = None
    created_at: datetime


class EnvironmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: Optional[str] = None
    # 保留 base_image_url 兼容字段，新的多图存储在 images 数组里
    base_image_url: Optional[str] = None
    prompt: Optional[str] = None
    # 种子图：生成场景图时可作为参考图传给模型
    seed_image_url: Optional[str] = None
    images: list[EnvironmentImageOut] = Field(default_factory=list)
    creator_id: int
    created_at: datetime
    updated_at: datetime


class GenerateEnvironmentImagesRequest(BaseModel):
    """为场景资产批量生成图片的请求体。与 GenerateViewsRequest 对齐。

    - count: 本次要生成的图片数量（1-20）；实际受场景图片总数上限约束
    - view_types: 每张图的视角/角度文案（如 "wide", "close-up", "overhead"），可为空
    - use_seed_image: 是否把场景的 seed_image_url 作为参考图传给模型
    - model_id: 图像模型 id，对应 /image-models 接口；不传走默认模型
    """

    count: int = Field(ge=1, le=20)
    view_types: list[str] = Field(default_factory=list)
    use_seed_image: bool = False
    model_id: Optional[str] = None
