from pydantic import BaseModel


class UpdateCreditsRequest(BaseModel):
    delta: int
    reason: str
