from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class StyleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    prompt: str
    reference_image_url: Optional[str] = None
    creator_id: int
    created_at: datetime
    updated_at: datetime
