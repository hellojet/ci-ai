from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from app.config import get_settings

settings = get_settings()

# SQLite 不支持 pool_size / max_overflow 参数
_engine_kwargs: dict = {"echo": False}
if "sqlite" not in settings.database_url:
    _engine_kwargs.update(pool_size=20, max_overflow=10)

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
