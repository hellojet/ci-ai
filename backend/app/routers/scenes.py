from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.scene import (
    CreateSceneRequest,
    ReorderScenesRequest,
    SceneOut,
    UpdateSceneRequest,
)
from app.services import scene_service

router = APIRouter(prefix="/projects/{project_id}/scenes", tags=["Scenes"])


@router.post("", response_model=ApiResponse[SceneOut])
async def create_scene(
    project_id: int,
    body: CreateSceneRequest,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    scene = await scene_service.create_scene(db, project_id, body)
    return ApiResponse(data=SceneOut.model_validate(scene))


@router.put("/{scene_id}", response_model=ApiResponse[SceneOut])
async def update_scene(
    project_id: int,
    scene_id: int,
    body: UpdateSceneRequest,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    scene = await scene_service.update_scene(db, project_id, scene_id, body)
    return ApiResponse(data=SceneOut.model_validate(scene))


@router.delete("/{scene_id}", response_model=ApiResponse[None])
async def delete_scene(
    project_id: int,
    scene_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    await scene_service.delete_scene(db, project_id, scene_id)
    return ApiResponse(message="Scene deleted")


@router.put("/reorder", response_model=ApiResponse[None])
async def reorder_scenes(
    project_id: int,
    body: ReorderScenesRequest,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    await scene_service.reorder_scenes(db, project_id, body.scene_orders)
    return ApiResponse(message="Scenes reordered")
