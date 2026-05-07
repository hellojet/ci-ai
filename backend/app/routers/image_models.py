"""图像模型清单路由。

模型清单由运维通过 .env 的 AI_IMAGE_MODELS（JSON 字符串）统一配置，
前端在生成图片的地方做下拉选择。api_key 等敏感字段不会返回到前端。
"""

from fastapi import APIRouter, Depends

from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.image_model import ImageModelListResponse, ImageModelOut
from app.services import image_models_service

router = APIRouter(prefix="/image-models", tags=["ImageModels"])


@router.get("", response_model=ApiResponse[ImageModelListResponse])
async def list_image_models(_user: User = Depends(get_current_user)):
    """返回已登录用户可用的图像模型清单。"""
    items = image_models_service.list_models_for_client()
    out_items = [
        ImageModelOut(
            id=item["id"],
            label=item["label"],
            display_name=item.get("display_name"),
            protocol=item["protocol"],
            is_default=item.get("default", False),
        )
        for item in items
    ]
    return ApiResponse(data=ImageModelListResponse(items=out_items))
