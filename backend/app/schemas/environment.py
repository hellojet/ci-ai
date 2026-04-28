from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class EnvironmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: Optional[str] = None
    base_image_url: Optional[str] = None
    prompt: Optional[str] = None
    creator_id: int
    created_at: datetime
    updated_at: datetime
