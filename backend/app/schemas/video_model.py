"""视频模型相关 schema。对外仅暴露 id/label/display_name/protocol，api_key 保留在后端。"""

from typing import Optional

from pydantic import BaseModel


class VideoModelOut(BaseModel):
    id: str
    label: str
    # 前端真正展示给用户看的 name（如 "快马 1.0"）；为 None 时前端回退到 label。
    display_name: Optional[str] = None
    protocol: str
    is_default: bool = False
    # 该模型是否支持传入驱动音频（如 wan2.7-i2v 支持 driving_audio）
    supports_audio: bool = False


class VideoModelListResponse(BaseModel):
    items: list[VideoModelOut]
