from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.character import CharacterOut, CharacterViewOut, GenerateViewsRequest
from app.schemas.common import ApiResponse, PaginatedData
from app.services import character_service

router = APIRouter(prefix="/characters", tags=["Characters"])


@router.get("", response_model=ApiResponse[PaginatedData[CharacterOut]])
async def list_characters(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    keyword: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    items, total = await character_service.get_characters(db, page, page_size, keyword)
    return ApiResponse(
        data=PaginatedData(
            total=total,
            items=[CharacterOut.model_validate(item) for item in items],
        )
    )


@router.post("", response_model=ApiResponse[CharacterOut])
async def create_character(
    name: str = Form(...),
    description: Optional[str] = Form(None),
    visual_prompt: Optional[str] = Form(None),
    seed_image: Optional[UploadFile] = File(None),
    seed_image_url: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # 优先使用 seed_image_url（前端已上传完成）；否则吃 UploadFile 并落盘
    if seed_image and seed_image.filename:
        from app.services import storage_service
        from app.config import get_settings

        file_data = await seed_image.read()
        seed_image_url = storage_service.upload_file(
            bucket_name=get_settings().minio_bucket_uploads,
            file_data=file_data,
            filename=seed_image.filename,
            content_type=seed_image.content_type or "image/png",
        )

    character = await character_service.create_character(
        db,
        creator_id=user.id,
        name=name,
        description=description,
        visual_prompt=visual_prompt,
        seed_image_url=seed_image_url,
    )
    return ApiResponse(data=CharacterOut.model_validate(character))


@router.get("/{character_id}", response_model=ApiResponse[CharacterOut])
async def get_character(
    character_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    character = await character_service.get_character(db, character_id)
    return ApiResponse(data=CharacterOut.model_validate(character))


@router.put("/{character_id}", response_model=ApiResponse[CharacterOut])
async def update_character(
    character_id: int,
    name: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    visual_prompt: Optional[str] = Form(None),
    seed_image: Optional[UploadFile] = File(None),
    # 允许前端把已上传到七牛/MinIO 的 URL 直接传回来，避免路由层再去落盘一次
    seed_image_url: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    # UploadFile 分支（兼容旧前端，不推荐）：把文件再丢给 storage_service 存一次
    if seed_image and seed_image.filename:
        from app.services import storage_service
        from app.config import get_settings

        file_data = await seed_image.read()
        seed_image_url = storage_service.upload_file(
            bucket_name=get_settings().minio_bucket_uploads,
            file_data=file_data,
            filename=seed_image.filename,
            content_type=seed_image.content_type or "image/png",
        )

    character = await character_service.update_character(
        db,
        character_id,
        name=name,
        description=description,
        visual_prompt=visual_prompt,
        seed_image_url=seed_image_url,
    )
    return ApiResponse(data=CharacterOut.model_validate(character))


@router.delete("/{character_id}", response_model=ApiResponse)
async def delete_character(
    character_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    await character_service.delete_character(db, character_id)
    return ApiResponse(message="Character deleted successfully")


@router.post(
    "/{character_id}/generate-views",
    response_model=ApiResponse[list[CharacterViewOut]],
)
async def generate_views(
    character_id: int,
    body: GenerateViewsRequest,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """派发异步生成任务，立即返回占位 view 列表（status=queued）。"""
    views = await character_service.generate_views(
        db,
        character_id,
        body.count,
        body.view_types,
        use_seed_image=body.use_seed_image,
    )
    return ApiResponse(
        data=[CharacterViewOut.model_validate(v) for v in views],
        message="Views generation dispatched",
    )


@router.post(
    "/{character_id}/views",
    response_model=ApiResponse[CharacterViewOut],
)
async def upload_view(
    character_id: int,
    image: Optional[UploadFile] = File(None),
    image_url: Optional[str] = Form(None),
    view_type: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """手动上传一张视图。

    - 推荐方式：前端先 POST /uploads 拿到 URL，再以 image_url 字段调用本接口。
    - 兼容方式：直接把 UploadFile 传过来，路由层落盘后再保存。
    """
    if image and image.filename:
        from app.services import storage_service
        from app.config import get_settings

        file_data = await image.read()
        image_url = storage_service.upload_file(
            bucket_name=get_settings().minio_bucket_uploads,
            file_data=file_data,
            filename=image.filename,
            content_type=image.content_type or "image/png",
        )

    view = await character_service.upload_view(
        db, character_id, image_url or "", view_type
    )
    return ApiResponse(data=CharacterViewOut.model_validate(view))


@router.delete(
    "/{character_id}/views/{view_id}",
    response_model=ApiResponse,
)
async def delete_view(
    character_id: int,
    view_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    await character_service.delete_view(db, character_id, view_id)
    return ApiResponse(message="View deleted successfully")
