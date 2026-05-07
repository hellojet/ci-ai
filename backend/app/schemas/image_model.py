"""图像模型相关 schema。对外仅暴露 id/label/display_name/protocol，api_key 保留在后端。"""

from typing import Optional

from pydantic import BaseModel


class ImageModelOut(BaseModel):
    id: str
    label: str
    # 前端真正展示给用户看的 name（如 "Nano Banana 2"）。为 None 时前端回退到 label。
    # 与 label（开发者/技术展示名）区分：display_name 是产品名/俗称，更友好。
    display_name: Optional[str] = None
    protocol: str
    is_default: bool = False


class ImageModelListResponse(BaseModel):
    items: list[ImageModelOut]
