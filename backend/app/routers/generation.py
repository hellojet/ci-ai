"""生成任务路由。"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.generation_task import GenerateRequest, GenerateResponse, TaskOut
from app.services import generation_service

router = APIRouter(tags=["Generation"])


@router.post(
    "/projects/{project_id}/shots/{shot_id}/generate",
    response_model=ApiResponse[GenerateResponse],
)
async def create_generation_task(
    project_id: int,
    shot_id: int,
    body: GenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = await generation_service.create_generation_task(
        db=db,
        project_id=project_id,
        shot_id=shot_id,
        task_type=body.task_type,
        user_id=current_user.id,
    )
    return ApiResponse(
        data=GenerateResponse(
            id=task.id,
            task_id=task.id,
            task_type=task.task_type,
            status=task.status,
            credits_cost=task.credits_cost,
        )
    )


@router.get(
    "/projects/{project_id}/shots/{shot_id}/tasks",
    response_model=ApiResponse[list[TaskOut]],
)
async def get_shot_tasks(
    project_id: int,
    shot_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tasks = await generation_service.get_shot_tasks(db, shot_id)
    return ApiResponse(data=[TaskOut.model_validate(t) for t in tasks])


@router.get("/tasks/{task_id}", response_model=ApiResponse[TaskOut])
async def get_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = await generation_service.get_task(db, task_id)
    return ApiResponse(data=TaskOut.model_validate(task))


@router.post("/tasks/{task_id}/retry", response_model=ApiResponse[GenerateResponse])
async def retry_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = await generation_service.retry_task(db, task_id, current_user.id)
    return ApiResponse(
        data=GenerateResponse(
            id=task.id,
            task_id=task.id,
            task_type=task.task_type,
            status=task.status,
            credits_cost=task.credits_cost,
        )
    )
