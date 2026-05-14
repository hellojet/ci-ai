from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

TrialStatus = Literal["pending", "contacted", "approved", "rejected"]

_EMAIL_RE = r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$"


class TrialRequestCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=64)
    email: str = Field(..., min_length=3, max_length=255, pattern=_EMAIL_RE)
    company: str | None = Field(None, max_length=128)
    use_case: str | None = Field(None, max_length=500)
    # honeypot — should always be empty for real users
    website: str | None = Field(None, max_length=512)

    @field_validator("name", "company", "use_case", mode="before")
    @classmethod
    def _strip(cls, v):
        if isinstance(v, str):
            v = v.strip()
            return v or None
        return v


class TrialRequestUpdate(BaseModel):
    status: TrialStatus | None = None
    admin_notes: str | None = None


class TrialRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    company: str | None = None
    use_case: str | None = None
    ip: str | None = None
    user_agent: str | None = None
    status: str
    admin_notes: str | None = None
    created_at: datetime
    updated_at: datetime
