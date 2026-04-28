"""系统设置服务。

优先级规则：数据库 > .env 环境变量
- .env 中的配置作为默认值
- admin 在管理后台修改后存入数据库，数据库值优先
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.system_settings import SystemSettings

# settings key -> config.py 字段名的映射
_ENV_DEFAULTS: dict[str, str] = {
    # 文本生成
    "api.text.endpoint": "ai_text_endpoint",
    "api.text.model": "ai_text_model",
    "api.text.api_key": "ai_text_api_key",
    "api.text.concurrency": "ai_text_concurrency",
    "api.text.timeout": "ai_text_timeout",
    # 图像生成
    "api.image.endpoint": "ai_image_endpoint",
    "api.image.model": "ai_image_model",
    "api.image.api_key": "ai_image_api_key",
    "api.image.concurrency": "ai_image_concurrency",
    "api.image.timeout": "ai_image_timeout",
    # 视频生成
    "api.video.endpoint": "ai_video_endpoint",
    "api.video.model": "ai_video_model",
    "api.video.api_key": "ai_video_api_key",
    "api.video.concurrency": "ai_video_concurrency",
    "api.video.timeout": "ai_video_timeout",
    # 音频生成
    "api.audio.endpoint": "ai_audio_endpoint",
    "api.audio.model": "ai_audio_model",
    "api.audio.api_key": "ai_audio_api_key",
    "api.audio.concurrency": "ai_audio_concurrency",
    "api.audio.timeout": "ai_audio_timeout",
}


def _get_env_default(key: str) -> str | None:
    """从 .env（config.py）中获取某个 settings key 的默认值。"""
    field_name = _ENV_DEFAULTS.get(key)
    if field_name is None:
        return None
    value = getattr(get_settings(), field_name, None)
    if value is None or value == "":
        return None
    return str(value)


async def get_all_settings(db: AsyncSession) -> list[SystemSettings]:
    result = await db.execute(select(SystemSettings).order_by(SystemSettings.key))
    return list(result.scalars().all())


async def get_all_settings_merged(db: AsyncSession) -> list[dict]:
    """获取合并后的完整配置列表（数据库 + .env 默认值）。

    返回 list[dict]，每个 dict 包含 key, value, source, updated_at。
    source: "database" 表示来自数据库，"env" 表示来自 .env 默认值。
    """
    db_settings = await get_all_settings(db)
    db_keys = {s.key for s in db_settings}

    merged: list[dict] = []

    # 数据库中已有的配置
    for setting in db_settings:
        raw_value = setting.value
        value = raw_value.get("value") if isinstance(raw_value, dict) else raw_value
        merged.append({
            "key": setting.key,
            "value": value,
            "source": "database",
            "updated_at": setting.updated_at,
        })

    # .env 中有但数据库中没有的默认配置
    for settings_key, field_name in _ENV_DEFAULTS.items():
        if settings_key not in db_keys:
            env_value = _get_env_default(settings_key)
            if env_value is not None:
                merged.append({
                    "key": settings_key,
                    "value": env_value,
                    "source": "env",
                    "updated_at": None,
                })

    merged.sort(key=lambda item: item["key"])
    return merged


async def get_setting(db: AsyncSession, key: str) -> SystemSettings | None:
    """获取单个配置项，数据库优先，.env 兜底。"""
    result = await db.execute(
        select(SystemSettings).where(SystemSettings.key == key)
    )
    db_setting = result.scalar_one_or_none()

    if db_setting is not None:
        return db_setting

    # 数据库中没有，尝试从 .env 读取默认值
    env_value = _get_env_default(key)
    if env_value is not None:
        # 构造一个临时的 SystemSettings 对象（不持久化），以保持返回类型一致
        return SystemSettings(
            key=key,
            value={"value": env_value},
            updated_by=None,
        )

    return None


async def get_setting_value(db: AsyncSession, key: str, default: str = "") -> str:
    """便捷方法：直接获取配置值字符串，数据库优先，.env 兜底。"""
    setting = await get_setting(db, key)
    if setting is None:
        return default
    raw_value = setting.value
    return str(raw_value.get("value", default) if isinstance(raw_value, dict) else raw_value)


async def update_settings(
    db: AsyncSession,
    items: list,
    user_id: int,
) -> list[SystemSettings]:
    """批量更新或创建系统设置项（写入数据库，覆盖 .env 默认值）。"""
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