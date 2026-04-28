from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_edit_lock
from app.models.user import User
from app.schemas.common import ApiResponse, PaginatedData
from app.schemas.project import (
    CreateProjectRequest,
    ProjectDetailOut,
    ProjectOut,
    UpdateProjectRequest,
)
from app.services import project_service

router = APIRouter(prefix="/projects", tags=["Projects"])


@router.get("", response_model=ApiResponse[PaginatedData[ProjectOut]])
async def list_projects(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_filter: str | None = Query(None, alias="status"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取当前用户的项目列表（分页）。"""
    projects, total = await project_service.get_projects(
        db, user.id, page, page_size, status_filter
    )
    return ApiResponse(
        data=PaginatedData(
            total=total,
            items=[ProjectOut.model_validate(p) for p in projects],
        )
    )


@router.post("", response_model=ApiResponse[ProjectOut], status_code=201)
async def create_project(
    data: CreateProjectRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """创建新项目。"""
    project = await project_service.create_project(db, user.id, data)
    return ApiResponse(data=ProjectOut.model_validate(project))


@router.get("/{project_id}", response_model=ApiResponse[ProjectDetailOut])
async def get_project_detail(
    project_id: int,
    db: AsyncSession = Depends(get_db),
):
    """获取项目详情，包含完整的树状关系结构。"""
    project = await project_service.get_project(db, project_id)
    return ApiResponse(data=ProjectDetailOut.model_validate(project))


@router.put("/{project_id}", response_model=ApiResponse[ProjectOut])
async def update_project(
    project_id: int,
    data: UpdateProjectRequest,
    user: User = Depends(require_edit_lock),
    db: AsyncSession = Depends(get_db),
):
    """更新项目信息，需要持有编辑锁。"""
    project = await project_service.update_project(db, project_id, data)
    return ApiResponse(data=ProjectOut.model_validate(project))


@router.delete("/{project_id}", response_model=ApiResponse)
async def delete_project(
    project_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """删除项目，仅创建者或管理员可操作。"""
    target_project = await project_service.get_project(db, project_id)

    if target_project.creator_id != user.id and user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the project creator or admin can delete this project",
        )

    await project_service.delete_project(db, project_id)
    return ApiResponse(message="Project deleted successfully")
