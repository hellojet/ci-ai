from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.common import ApiResponse, PaginatedData
from app.schemas.environment import EnvironmentOut
from app.services import environment_service

router = APIRouter(prefix="/environments", tags=["Environments"])


@router.get("", response_model=ApiResponse[PaginatedData[EnvironmentOut]])
async def list_environments(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    keyword: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    items, total = await environment_service.get_environments(
        db, page, page_size, keyword
    )
    return ApiResponse(
        data=PaginatedData(
            total=total,
            items=[EnvironmentOut.model_validate(item) for item in items],
        )
    )


@router.post("", response_model=ApiResponse[EnvironmentOut])
async def create_environment(
    name: str = Form(...),
    description: Optional[str] = Form(None),
    prompt: Optional[str] = Form(None),
    base_image: Optional[UploadFile] = File(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    base_image_url: Optional[str] = None
    if base_image and base_image.filename:
        base_image_url = f"/uploads/environments/{base_image.filename}"

    environment = await environment_service.create_environment(
        db,
        creator_id=user.id,
        name=name,
        description=description,
        prompt=prompt,
        base_image_url=base_image_url,
    )
    return ApiResponse(data=EnvironmentOut.model_validate(environment))


@router.get("/{environment_id}", response_model=ApiResponse[EnvironmentOut])
async def get_environment(
    environment_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    environment = await environment_service.get_environment(db, environment_id)
    return ApiResponse(data=EnvironmentOut.model_validate(environment))


@router.put("/{environment_id}", response_model=ApiResponse[EnvironmentOut])
async def update_environment(
    environment_id: int,
    name: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    prompt: Optional[str] = Form(None),
    base_image: Optional[UploadFile] = File(None),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    base_image_url: Optional[str] = None
    if base_image and base_image.filename:
        base_image_url = f"/uploads/environments/{base_image.filename}"

    environment = await environment_service.update_environment(
        db,
        environment_id,
        name=name,
        description=description,
        prompt=prompt,
        base_image_url=base_image_url,
    )
    return ApiResponse(data=EnvironmentOut.model_validate(environment))


@router.delete("/{environment_id}", response_model=ApiResponse)
async def delete_environment(
    environment_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    await environment_service.delete_environment(db, environment_id)
    return ApiResponse(message="Environment deleted successfully")


@router.post(
    "/{environment_id}/generate-image",
    response_model=ApiResponse,
)
async def generate_environment_image(
    environment_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    await environment_service.generate_environment_image(db, environment_id)
    return ApiResponse(message="Environment image generated successfully")


@router.delete(
    "/{environment_id}/images/{image_id}",
    response_model=ApiResponse,
)
async def delete_environment_image(
    environment_id: int,
    image_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """删除场景资产下的一张具体图片。对应测试用例 TC-3.4。"""
    await environment_service.delete_environment_image(db, environment_id, image_id)
    return ApiResponse(message="Environment image deleted successfully")
