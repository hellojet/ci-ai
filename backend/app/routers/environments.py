from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.common import ApiResponse, PaginatedData
from app.schemas.environment import (
    EnvironmentImageOut,
    EnvironmentOut,
    GenerateEnvironmentImagesRequest,
)
from app.services import environment_service

router = APIRouter(prefix="/environments", tags=["Environments"])


@router.get("", response_model=ApiResponse[PaginatedData[EnvironmentOut]])
async def list_environments(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    keyword: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    items, total = await environment_service.get_environments(
        db, user.id, page, page_size, keyword
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
    # 场景种子图：生成参考图时会作为 reference_image_url 传给图像 API
    seed_image: Optional[UploadFile] = File(None),
    # 允许前端已上传的 URL 直传，避免路由层再落盘一次
    seed_image_url: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    base_image_url: Optional[str] = None
    if base_image and base_image.filename:
        base_image_url = f"/uploads/environments/{base_image.filename}"

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

    environment = await environment_service.create_environment(
        db,
        creator_id=user.id,
        name=name,
        description=description,
        prompt=prompt,
        base_image_url=base_image_url,
        seed_image_url=seed_image_url,
    )
    return ApiResponse(data=EnvironmentOut.model_validate(environment))


@router.get("/{environment_id}", response_model=ApiResponse[EnvironmentOut])
async def get_environment(
    environment_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    environment = await environment_service.get_environment(db, environment_id, creator_id=user.id)
    return ApiResponse(data=EnvironmentOut.model_validate(environment))


@router.put("/{environment_id}", response_model=ApiResponse[EnvironmentOut])
async def update_environment(
    environment_id: int,
    name: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    prompt: Optional[str] = Form(None),
    base_image: Optional[UploadFile] = File(None),
    seed_image: Optional[UploadFile] = File(None),
    seed_image_url: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # 先校验归属
    await environment_service.get_environment(db, environment_id, creator_id=user.id)

    base_image_url: Optional[str] = None
    if base_image and base_image.filename:
        base_image_url = f"/uploads/environments/{base_image.filename}"

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

    environment = await environment_service.update_environment(
        db,
        environment_id,
        name=name,
        description=description,
        prompt=prompt,
        base_image_url=base_image_url,
        seed_image_url=seed_image_url,
    )
    return ApiResponse(data=EnvironmentOut.model_validate(environment))


@router.delete("/{environment_id}", response_model=ApiResponse)
async def delete_environment(
    environment_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await environment_service.get_environment(db, environment_id, creator_id=user.id)
    await environment_service.delete_environment(db, environment_id)
    return ApiResponse(message="Environment deleted successfully")


@router.post(
    "/{environment_id}/generate-image",
    response_model=ApiResponse[list[EnvironmentImageOut]],
)
async def generate_environment_image(
    environment_id: int,
    body: GenerateEnvironmentImagesRequest,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """派发异步生成任务，立即返回占位 image 列表（status=queued）。

    对齐 /characters/{id}/generate-views 的设计：
    - body.count: 本次生成的图片数量（1-20），受场景 20 张上限约束
    - body.view_types: 每张图的视角提示（如 wide/close-up/overhead）
    - body.use_seed_image: 是否把场景 seed_image_url 作为参考图
    - body.model_id: 指定图像模型 id（AI_IMAGE_MODELS 中某一项），不传走默认模型
    """
    images = await environment_service.generate_environment_images(
        db,
        environment_id,
        count=body.count,
        view_types=body.view_types,
        use_seed_image=body.use_seed_image,
        model_id=body.model_id,
    )
    return ApiResponse(
        data=[EnvironmentImageOut.model_validate(img) for img in images],
        message="Environment images generation dispatched",
    )


@router.post(
    "/{environment_id}/images",
    response_model=ApiResponse[EnvironmentImageOut],
)
async def upload_environment_image(
    environment_id: int,
    image: Optional[UploadFile] = File(None),
    image_url: Optional[str] = Form(None),
    view_type: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """手动上传一张场景图。

    - 推荐：前端先 POST /uploads 拿到 URL，再以 image_url 字段调用本接口
    - 兼容：直接把 UploadFile 传过来，路由层落盘后再保存
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

    env_image = await environment_service.upload_environment_image(
        db, environment_id, image_url or "", view_type
    )
    return ApiResponse(data=EnvironmentImageOut.model_validate(env_image))


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
