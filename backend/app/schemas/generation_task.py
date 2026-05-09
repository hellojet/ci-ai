from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class GenerateRequest(BaseModel):
    task_type: Literal["image", "video", "audio"]
    # 图像生成时可选：对应 /image-models 返回的 id；不传走服务端默认模型。
    # 其它任务类型此字段会被后端忽略。
    model_id: Optional[str] = None
    # 生成参数（按任务类型形态不同）：
    #   image: {"ratio": "9:16" | "16:9" | "1:1" | ..., "resolution": "1080p" | "720p" | "2k" | ...}
    #   video: {"ratio": "9:16" | ..., "resolution": "1080p" | ..., "duration": 5, "watermark": false}
    # 全部可选；缺省时由 worker / adapter 用默认值兜底（图片 9:16/1080p；视频 9:16/1080p/5s/无水印）。
    # 用 dict[str, Any] 保留扩展性（后续要加 seed / cfg_scale 等不用改 schema）。
    params: Optional[dict[str, Any]] = Field(default=None)


class GenerateResponse(BaseModel):
    id: int
    task_id: int
    task_type: str
    status: str
    credits_cost: int
    model_key: Optional[str] = None


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    shot_id: int
    task_type: str
    status: str
    retry_count: int
    credits_cost: int
    result_url: Optional[str] = None
    error_message: Optional[str] = None
    celery_task_id: Optional[str] = None
    model_key: Optional[str] = None
    params: Optional[dict[str, Any]] = None
    created_by: int
    created_at: datetime
    updated_at: datetime


class BatchGenerateResponse(BaseModel):
    tasks: list
    total_credits_cost: int
