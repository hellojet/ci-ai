from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from app.config import get_settings

settings = get_settings()

# SQLite 不支持 pool_size / max_overflow 参数
_engine_kwargs: dict = {"echo": False}
if "sqlite" not in settings.database_url:
    # Supabase session 模式限制 max_clients=15，
    # 异步引擎占 5+3=8，Celery 同步引擎占 2+3=5，共 13，留 2 余量给 CLI / 迁移等
    _engine_kwargs.update(pool_size=5, max_overflow=3, pool_pre_ping=True, pool_recycle=300)

engine = create_async_engine(settings.database_url, **_engine_kwargs)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:  # type: ignore[misc]
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()
