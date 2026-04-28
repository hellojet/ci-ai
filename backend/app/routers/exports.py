"""项目导出路由。"""

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.common import ApiResponse
from app.services import export_service

router = APIRouter(tags=["Export"])


@router.get(
    "/projects/{project_id}/export/json",
    response_model=ApiResponse[dict],
)
async def export_project_json(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = await export_service.export_project_json(db, project_id)
    return ApiResponse(data=data)


@router.get("/projects/{project_id}/export/zip")
async def export_project_zip(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    zip_bytes = await export_service.export_project_zip(db, project_id)
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename=project_{project_id}.zip"},
    )
