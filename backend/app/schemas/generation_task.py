from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict


class GenerateRequest(BaseModel):
    task_type: Literal["image", "video", "audio"]


class GenerateResponse(BaseModel):
    id: int
    task_id: int
    task_type: str
    status: str
    credits_cost: int


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
    created_by: int
    created_at: datetime
    updated_at: datetime


class BatchGenerateResponse(BaseModel):
    tasks: list
    total_credits_cost: int
