from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict


class GenerateRequest(BaseModel):
    task_type: Literal["image", "video", "audio"]
    # 图像生成时可选：对应 /image-models 返回的 id；不传走服务端默认模型。
    # 其它任务类型此字段会被后端忽略。
    model_id: Optional[str] = None


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
    created_by: int
    created_at: datetime
    updated_at: datetime


class BatchGenerateResponse(BaseModel):
    tasks: list
    total_credits_cost: int
