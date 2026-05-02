from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict


class ScriptOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    content: Optional[str] = None
    parsed: bool
    created_at: datetime
    updated_at: datetime


class UpdateScriptRequest(BaseModel):
    content: str


class GenerateScriptRequest(BaseModel):
    prompt: str
    mode: Literal["generate", "expand", "rewrite"]


class GenerateScriptResponse(BaseModel):
    content: str


class ParsedCharacterMatch(BaseModel):
    character_id: int
    name: str
    matched: bool


class ParsedShot(BaseModel):
    title: str = ""
    narration: str = ""
    dialogue: str = ""
    action_description: str = ""
    camera_angle: str = "medium"
    matched_characters: list[ParsedCharacterMatch] = []
    unmatched_characters: list[str] = []


class ParsedScene(BaseModel):
    title: str
    description_prompt: str
    matched_environment_id: Optional[int] = None
    environment_matched: bool
    shots: list[ParsedShot]


class ParseResult(BaseModel):
    scenes: list[ParsedScene]
    warnings: list[str]
