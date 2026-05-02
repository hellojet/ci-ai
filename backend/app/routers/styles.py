from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.common import ApiResponse, PaginatedData
from app.schemas.style import StyleOut
from app.services import style_service

router = APIRouter(prefix="/styles", tags=["Styles"])


@router.get("", response_model=ApiResponse[PaginatedData[StyleOut]])
async def list_styles(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    items, total = await style_service.get_styles(db, page, page_size)
    return ApiResponse(
        data=PaginatedData(
            total=total,
            items=[StyleOut.model_validate(item) for item in items],
        )
    )


@router.post("", response_model=ApiResponse[StyleOut])
async def create_style(
    name: str = Form(...),
    prompt: str = Form(...),
    reference_image: Optional[UploadFile] = File(None),
    reference_image_url: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # 优先使用 reference_image_url（前端已上传完成）；否则吃 UploadFile 并落盘
    if reference_image and reference_image.filename:
        from app.services import storage_service
        from app.config import get_settings

        file_data = await reference_image.read()
        reference_image_url = storage_service.upload_file(
            bucket_name=get_settings().minio_bucket_uploads,
            file_data=file_data,
            filename=reference_image.filename,
            content_type=reference_image.content_type or "image/png",
        )

    style = await style_service.create_style(
        db,
        creator_id=user.id,
        name=name,
        prompt=prompt,
        reference_image_url=reference_image_url,
    )
    return ApiResponse(data=StyleOut.model_validate(style))


@router.get("/{style_id}", response_model=ApiResponse[StyleOut])
async def get_style(
    style_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    style = await style_service.get_style(db, style_id)
    return ApiResponse(data=StyleOut.model_validate(style))


@router.put("/{style_id}", response_model=ApiResponse[StyleOut])
async def update_style(
    style_id: int,
    name: Optional[str] = Form(None),
    prompt: Optional[str] = Form(None),
    reference_image: Optional[UploadFile] = File(None),
    reference_image_url: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    if reference_image and reference_image.filename:
        from app.services import storage_service
        from app.config import get_settings

        file_data = await reference_image.read()
        reference_image_url = storage_service.upload_file(
            bucket_name=get_settings().minio_bucket_uploads,
            file_data=file_data,
            filename=reference_image.filename,
            content_type=reference_image.content_type or "image/png",
        )

    style = await style_service.update_style(
        db,
        style_id,
        name=name,
        prompt=prompt,
        reference_image_url=reference_image_url,
    )
    return ApiResponse(data=StyleOut.model_validate(style))


@router.delete("/{style_id}", response_model=ApiResponse)
async def delete_style(
    style_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    await style_service.delete_style(db, style_id)
    return ApiResponse(message="Style deleted successfully")

@router.post(
    "/{style_id}/generate-image",
    response_model=ApiResponse[StyleOut],
)
async def generate_style_image(
    style_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    style = await style_service.generate_style_image(db, style_id)
    return ApiResponse(data=StyleOut.model_validate(style))
