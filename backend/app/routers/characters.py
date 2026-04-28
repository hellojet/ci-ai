from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.character import CharacterOut, GenerateViewsRequest
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
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Handle file upload if provided
    seed_image_url: Optional[str] = None
    if seed_image and seed_image.filename:
        # Placeholder: in production, upload to MinIO/S3 and get URL
        seed_image_url = f"/uploads/characters/{seed_image.filename}"

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
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    seed_image_url: Optional[str] = None
    if seed_image and seed_image.filename:
        seed_image_url = f"/uploads/characters/{seed_image.filename}"

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
    response_model=ApiResponse,
)
async def generate_views(
    character_id: int,
    body: GenerateViewsRequest,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    await character_service.generate_views(
        db, character_id, body.count, body.view_types
    )
    return ApiResponse(message="Views generated successfully")


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
