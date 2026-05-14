"""公开路由：落地页申请试用提交。"""

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.common import ApiResponse
from app.schemas.trial_request import TrialRequestCreate, TrialRequestOut
from app.services import trial_request_service

router = APIRouter(prefix="/trial-requests", tags=["TrialRequests"])


@router.post("", response_model=ApiResponse[TrialRequestOut | None])
async def submit_trial_request(
    body: TrialRequestCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """公开端：落地页提交申请试用。

    - 蜜罐命中 → 静默成功（return data=None），不入库不报错
    - 同邮箱 / 同 IP 命中防刷 → 抛 429（由全局 handler 包装为 ApiResponse）
    """
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    record = await trial_request_service.create(db, body, client_ip, user_agent)
    if record is None:
        # 蜜罐被填，对外仍返回成功
        return ApiResponse(data=None, message="ok")
    return ApiResponse(data=TrialRequestOut.model_validate(record))
