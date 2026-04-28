"""文件上传路由。"""

from fastapi import APIRouter, Depends, File, Form, UploadFile

from app.config import get_settings
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.common import ApiResponse
from app.services import storage_service

router = APIRouter(tags=["Uploads"])


@router.post("/uploads", response_model=ApiResponse[dict])
async def upload_file(
    file: UploadFile = File(...),
    category: str = Form("uploads"),
    current_user: User = Depends(get_current_user),
):
    """通用文件上传，category 映射到 MinIO bucket。"""
    settings = get_settings()
    bucket_map = {
        "uploads": settings.minio_bucket_uploads,
        "generated": settings.minio_bucket_generated,
        "exports": settings.minio_bucket_exports,
    }
    bucket_name = bucket_map.get(category, settings.minio_bucket_uploads)

    file_data = await file.read()
    url = storage_service.upload_file(
        bucket_name=bucket_name,
        file_data=file_data,
        filename=file.filename or "unknown",
        content_type=file.content_type or "application/octet-stream",
    )
    return ApiResponse(data={"url": url, "filename": file.filename})
