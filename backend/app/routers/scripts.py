from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_edit_lock
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.script import (
    GenerateScriptRequest,
    GenerateScriptResponse,
    ParseResult,
    ScriptOut,
    UpdateScriptRequest,
)
from app.services import script_service

router = APIRouter(prefix="/projects/{project_id}", tags=["Scripts"])


@router.get("/script", response_model=ApiResponse[ScriptOut])
async def get_script(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    script = await script_service.get_script(db, project_id)
    return ApiResponse(data=ScriptOut.model_validate(script))


@router.put("/script", response_model=ApiResponse[ScriptOut])
async def update_script(
    project_id: int,
    body: UpdateScriptRequest,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    script = await script_service.update_script(db, project_id, body.content)
    return ApiResponse(data=ScriptOut.model_validate(script))


@router.post("/script/generate", response_model=ApiResponse[GenerateScriptResponse])
async def generate_script(
    project_id: int,
    body: GenerateScriptRequest,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    content = await script_service.generate_script(
        db, project_id, body.prompt, body.mode
    )
    return ApiResponse(data=GenerateScriptResponse(content=content))


@router.post("/script/parse", response_model=ApiResponse[ParseResult])
async def parse_script(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    result = await script_service.parse_script(db, project_id)
    return ApiResponse(data=result)
