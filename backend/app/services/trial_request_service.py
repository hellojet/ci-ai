"""试用申请服务：公开提交（防刷）、admin 列表 / 更新 / 删除。"""

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.trial_request import TrialRequest
from app.schemas.trial_request import TrialRequestCreate, TrialRequestUpdate

# 防刷阈值
_EMAIL_WINDOW_HOURS = 24
_EMAIL_WINDOW_LIMIT = 1
_IP_WINDOW_HOURS = 24
_IP_WINDOW_LIMIT = 5


def _is_honeypot_triggered(payload: TrialRequestCreate) -> bool:
    """蜜罐字段被填即视为机器人。正常用户看不到该 input。"""
    return bool(payload.website and payload.website.strip())


async def _count_within_window(
    db: AsyncSession,
    column,
    value: str,
    hours: int,
) -> int:
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    result = await db.execute(
        select(func.count(TrialRequest.id))
        .where(column == value)
        .where(TrialRequest.created_at >= since)
    )
    return result.scalar() or 0


async def create(
    db: AsyncSession,
    payload: TrialRequestCreate,
    ip: str | None,
    user_agent: str | None,
) -> TrialRequest | None:
    """提交申请。

    - 蜜罐命中 → 返回 None（路由层据此返回静默成功，不入库不报错）
    - 同邮箱 24h 内已提交 → 抛 429
    - 同 IP 24h 内 ≥ 5 次 → 抛 429
    - 否则入库
    """
    if _is_honeypot_triggered(payload):
        return None

    email_count = await _count_within_window(
        db, TrialRequest.email, payload.email, _EMAIL_WINDOW_HOURS
    )
    if email_count >= _EMAIL_WINDOW_LIMIT:
        raise HTTPException(
            status_code=429,
            detail="Email already submitted within 24 hours",
        )

    if ip:
        ip_count = await _count_within_window(
            db, TrialRequest.ip, ip, _IP_WINDOW_HOURS
        )
        if ip_count >= _IP_WINDOW_LIMIT:
            raise HTTPException(
                status_code=429,
                detail="Too many requests from this IP",
            )

    record = TrialRequest(
        name=payload.name,
        email=payload.email,
        company=payload.company,
        use_case=payload.use_case,
        ip=ip,
        user_agent=user_agent,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


async def list_(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
    status_filter: str | None = None,
    keyword: str | None = None,
) -> tuple[list[TrialRequest], int]:
    base = select(TrialRequest)
    count_base = select(func.count(TrialRequest.id))

    if status_filter:
        base = base.where(TrialRequest.status == status_filter)
        count_base = count_base.where(TrialRequest.status == status_filter)

    if keyword:
        kw = f"%{keyword.strip()}%"
        cond = or_(
            TrialRequest.email.ilike(kw),
            TrialRequest.name.ilike(kw),
            TrialRequest.company.ilike(kw),
        )
        base = base.where(cond)
        count_base = count_base.where(cond)

    count_result = await db.execute(count_base)
    total = count_result.scalar() or 0

    result = await db.execute(
        base.order_by(TrialRequest.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = list(result.scalars().all())
    return items, total


async def update(
    db: AsyncSession,
    request_id: int,
    payload: TrialRequestUpdate,
) -> TrialRequest:
    result = await db.execute(
        select(TrialRequest).where(TrialRequest.id == request_id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Trial request not found")

    if payload.status is not None:
        record.status = payload.status
    if payload.admin_notes is not None:
        record.admin_notes = payload.admin_notes

    await db.commit()
    await db.refresh(record)
    return record


async def delete(db: AsyncSession, request_id: int) -> None:
    result = await db.execute(
        select(TrialRequest).where(TrialRequest.id == request_id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Trial request not found")
    await db.delete(record)
    await db.commit()
