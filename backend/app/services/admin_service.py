"""管理员服务：用户管理、积分调整、角色变更。"""

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


async def get_users(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[User], int]:
    count_result = await db.execute(select(func.count(User.id)))
    total = count_result.scalar() or 0

    result = await db.execute(
        select(User)
        .order_by(User.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    users = list(result.scalars().all())
    return users, total


async def update_user_credits(
    db: AsyncSession,
    user_id: int,
    delta: int,
) -> User:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.credits = max(0, user.credits + delta)
    await db.commit()
    await db.refresh(user)
    return user


async def update_user_role(
    db: AsyncSession,
    user_id: int,
    role: str,
) -> User:
    if role not in ("user", "admin"):
        raise HTTPException(status_code=400, detail="Role must be 'user' or 'admin'")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.role = role
    await db.commit()
    await db.refresh(user)
    return user


async def delete_user(db: AsyncSession, user_id: int) -> None:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await db.delete(user)
    await db.commit()
