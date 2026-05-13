"""视频模型清单路由。

模型清单由运维通过 .env 的 AI_VIDEO_MODELS（JSON 字符串）统一配置，
前端在生成视频的地方做下拉选择。api_key 等敏感字段不会返回到前端。
"""

from fastapi import APIRouter, Depends

from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.video_model import VideoModelListResponse, VideoModelOut
from app.services import video_models_service

router = APIRouter(prefix="/video-models", tags=["VideoModels"])


@router.get("", response_model=ApiResponse[VideoModelListResponse])
async def list_video_models(_user: User = Depends(get_current_user)):
    """返回已登录用户可用的视频模型清单。"""
    items = video_models_service.list_models_for_client()
    out_items = [
        VideoModelOut(
            id=item["id"],
            label=item["label"],
            display_name=item.get("display_name"),
            protocol=item["protocol"],
            is_default=item.get("default", False),
            supports_audio=item.get("supports_audio", False),
        )
        for item in items
    ]
    return ApiResponse(data=VideoModelListResponse(items=out_items))
