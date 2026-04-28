"""系统设置服务。"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.system_settings import SystemSettings


async def get_all_settings(db: AsyncSession) -> list[SystemSettings]:
    result = await db.execute(select(SystemSettings).order_by(SystemSettings.key))
    return list(result.scalars().all())


async def get_setting(db: AsyncSession, key: str) -> SystemSettings | None:
    result = await db.execute(
        select(SystemSettings).where(SystemSettings.key == key)
    )
    return result.scalar_one_or_none()


async def update_settings(
    db: AsyncSession,
    items: list,
    user_id: int,
) -> list[SystemSettings]:
    """批量更新或创建系统设置项。"""
    updated: list[SystemSettings] = []
    for item in items:
        result = await db.execute(
            select(SystemSettings).where(SystemSettings.key == item.key)
        )
        setting = result.scalar_one_or_none()
        if setting:
            setting.value = {"value": item.value}
            setting.updated_by = user_id
        else:
            setting = SystemSettings(
                key=item.key,
                value={"value": item.value},
                updated_by=user_id,
            )
            db.add(setting)
        await db.flush()
        await db.refresh(setting)
        updated.append(setting)
    await db.commit()
    return updated
