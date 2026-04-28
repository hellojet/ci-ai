from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_edit_lock
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.shot import (
    CreateShotRequest,
    LockImageRequest,
    PromptPreviewResponse,
    ReorderShotsRequest,
    ShotOut,
    UpdateShotRequest,
)
from app.services import shot_service

router = APIRouter(prefix="/projects/{project_id}", tags=["Shots"])

@router.post(
    "/scenes/{scene_id}/shots", response_model=ApiResponse[ShotOut]
)
async def create_shot(
    project_id: int,
    scene_id: int,
    body: CreateShotRequest,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    shot = await shot_service.create_shot(db, project_id, scene_id, body)
    return ApiResponse(data=ShotOut.model_validate(shot))
@router.put("/shots/{shot_id}", response_model=ApiResponse[ShotOut])
async def update_shot(
    project_id: int,
    shot_id: int,
    body: UpdateShotRequest,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    shot = await shot_service.update_shot(db, project_id, shot_id, body)
    return ApiResponse(data=ShotOut.model_validate(shot))

@router.delete("/shots/{shot_id}", response_model=ApiResponse[None])
async def delete_shot(
    project_id: int,
    shot_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    await shot_service.delete_shot(db, project_id, shot_id)
    return ApiResponse(message="Shot deleted")

@router.put("/shots/reorder", response_model=ApiResponse[None])
async def reorder_shots(
    project_id: int,
    body: ReorderShotsRequest,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
    await shot_service.reorder_shots(db, project_id, body.shot_orders)
    return ApiResponse(message="Shots reordered")


@router.get(
    "/shots/{shot_id}/prompt",
    response_model=ApiResponse[PromptPreviewResponse],
)
async def get_shot_prompt(
    project_id: int,
    shot_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    result = await shot_service.get_shot_prompt(db, project_id, shot_id)
    return ApiResponse(data=result)


    body: LockImageRequest,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    await shot_service.lock_image(db, project_id, shot_id, body.image_id)
    return ApiResponse(message="Image locked")

@router.post(
    "/shots/{shot_id}/upload-audio", response_model=ApiResponse[None]
)
async def upload_audio(
    project_id: int,
    shot_id: int,
    audio: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),

@router.post(
    "/shots/{shot_id}/upload-audio", response_model=ApiResponse[None]
)
async def upload_audio(
    project_id: int,
    shot_id: int,
    audio: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_edit_lock),
):
    # Save uploaded file and get URL
    # For now, store the filename as a placeholder URL
    audio_url = f"/uploads/audio/{audio.filename}"
    await shot_service.upload_audio(db, project_id, shot_id, audio_url)
    return ApiResponse(message="Audio uploaded")
