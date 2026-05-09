"""CI.AI 后端 FastAPI 应用入口。"""

import logging
import os
import traceback
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

# 导入所有 ORM 模型，确保 Base.metadata 包含所有表
from app import models  # noqa: F401  # side-effect: register models
from app.database import Base, engine
from app.routers import (
    admin,
    auth,
    characters,
    environments,
    exports,
    generation,
    image_models,
    projects,
    scenes,
    scripts,
    settings,
    shots,
    styles,
    uploads,
    video_models,
    ws,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

logger = logging.getLogger(__name__)


async def _fetch_existing_columns(conn, dialect: str, table_name: str) -> set[str]:
    """读取指定表已存在的列名集合。不同方言走不同的元数据查询。

    - sqlite   : PRAGMA table_info(<t>)
    - postgres : information_schema.columns
    - mysql    : information_schema.columns
    其它方言一律返回空集合（即跳过自动补列，避免误操作）。
    """
    from sqlalchemy import text

    if dialect == "sqlite":
        rows = await conn.execute(text(f"PRAGMA table_info({table_name})"))
        return {row[1] for row in rows.fetchall()}

    if dialect in ("postgresql", "postgres"):
        rows = await conn.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = :t AND table_schema = current_schema()"
            ),
            {"t": table_name},
        )
        return {row[0] for row in rows.fetchall()}

    if dialect == "mysql":
        rows = await conn.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema = DATABASE() AND table_name = :t"
            ),
            {"t": table_name},
        )
        return {row[0] for row in rows.fetchall()}

    return set()


def _build_add_column_ddl(table_name: str, column, dialect_obj) -> str | None:
    """根据 SQLAlchemy Column 反推一段 ALTER TABLE ADD COLUMN DDL。

    返回 None 表示"无法安全推断"，调用方应跳过并提示用户手动迁移。

    设计要点：
    - JSON 列在 SQLite 上落 TEXT，避免 DDL 语法不兼容；其它方言保持原 JSON
    - NOT NULL 列若没有 default，必须降级为 NULL（否则 SQLite 拒绝执行 ADD COLUMN）
    - server_default 优先（DDL 字面量）；否则尝试 Python 端 default
    """
    dialect_name = dialect_obj.name

    try:
        col_type = column.type.compile(dialect=dialect_obj)
    except Exception:
        col_type = "TEXT"

    # SQLite 没有 JSON 原生类型，SQLAlchemy 会编译成字面量 "JSON"
    # 实测 SQLite 接受 JSON 类型字面量（按 TEXT 处理），但保险起见强制降级为 TEXT
    if dialect_name == "sqlite" and col_type.upper() == "JSON":
        col_type = "TEXT"

    nullable = "NULL" if column.nullable else "NOT NULL"

    default_clause = ""
    server_default = getattr(column, "server_default", None)
    if server_default is not None and getattr(server_default, "arg", None) is not None:
        sd_arg = server_default.arg
        sd_text = getattr(sd_arg, "text", None) or (sd_arg if isinstance(sd_arg, str) else None)
        if sd_text is not None:
            default_clause = f" DEFAULT {sd_text}"

    if not default_clause and column.default is not None and getattr(column.default, "arg", None) is not None:
        default_value = column.default.arg
        if isinstance(default_value, bool):
            # bool 是 int 子类，必须先判断
            default_clause = f" DEFAULT {1 if default_value else 0}"
        elif isinstance(default_value, (int, float)):
            default_clause = f" DEFAULT {default_value}"
        elif isinstance(default_value, str):
            default_clause = f" DEFAULT '{default_value}'"

    # NOT NULL 但没默认值：SQLite/MySQL 会拒绝 ADD COLUMN，统一降级为 NULL
    if not column.nullable and not default_clause:
        nullable = "NULL"

    return (
        f"ALTER TABLE {table_name} ADD COLUMN {column.name} {col_type} "
        f"{nullable}{default_clause}"
    ).strip()


async def _ensure_missing_columns(conn) -> list[tuple[str, str]]:
    """跨方言的"自动补列"轻量迁移。

    遍历 ORM 元数据中的所有表，对比数据库实际列，缺失的就 ALTER TABLE ADD COLUMN。
    支持 sqlite / postgres / mysql；其它方言静默跳过（生产请走 alembic）。

    返回值：[(table_name, column_name), ...] 用于上层日志统计。
    单条 DDL 失败不阻断整体启动，只在 warning 里留痕，并把失败建议手动 SQL 打到 error 日志。
    """
    from sqlalchemy import text

    dialect_obj = conn.dialect
    dialect_name = dialect_obj.name
    if dialect_name not in ("sqlite", "postgresql", "postgres", "mysql"):
        logger.info(
            "Auto-migrate: dialect=%s 不支持自动补列，请使用 alembic 进行迁移。",
            dialect_name,
        )
        return []

    added: list[tuple[str, str]] = []
    for table in Base.metadata.sorted_tables:
        table_name = table.name
        existing_cols = await _fetch_existing_columns(conn, dialect_name, table_name)
        if not existing_cols:
            # 表本身不存在，create_all 已处理；跳过避免误执行 ALTER
            continue

        for column in table.columns:
            if column.name in existing_cols:
                continue
            ddl = _build_add_column_ddl(table_name, column, dialect_obj)
            if not ddl:
                logger.warning(
                    "Auto-migrate: 无法为 %s.%s 推断 DDL，请手动添加该列。",
                    table_name, column.name,
                )
                continue
            try:
                logger.warning("Auto-migrate: %s", ddl)
                await conn.execute(text(ddl))
                added.append((table_name, column.name))
            except Exception as exc:  # noqa: BLE001
                # 不阻塞启动，但留下清晰日志便于人工兜底
                logger.error(
                    "Auto-migrate FAILED for %s.%s (%s). 请手动执行：%s",
                    table_name, column.name, exc, ddl,
                )
    return added


async def _init_database_and_defaults() -> None:
    """启动时保证：建表、创建 admin 用户、预置 SystemSettings。

    - 对 SQLite 等环境使用 Base.metadata.create_all（幂等）。
    - 针对 SQLite 额外做 "自动补列" 迁移，兼容旧数据库。
    - 若 admin 用户不存在则创建 admin/admin123，role=admin，credits=1000。
    - 从 .env 读取 AI API 默认配置，写入 system_settings 表（如已存在则跳过）。
    """
    from sqlalchemy import select as sa_select

    from app.models.user import User
    from app.models.system_settings import SystemSettings
    from app.database import async_session
    from app.utils.security import hash_password
    from app.services.settings_service import _ENV_DEFAULTS, _get_env_default

    # 1) 建表（幂等；alembic 环境下可省，但此处保证 SQLite 本地能跑起来）
    #    顺带做一次跨方言的"自动补列"轻迁移，覆盖 sqlite / postgres / mysql，
    #    避免老库新增列后必须手动 ALTER 的尴尬（如本次的 generation_tasks.params）。
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        added_columns = await _ensure_missing_columns(conn)
    if added_columns:
        logger.warning(
            "Auto-migrate: 已为旧库补齐 %d 列：%s",
            len(added_columns),
            ", ".join(f"{t}.{c}" for t, c in added_columns),
        )
    logger.info("Database schema ensured via Base.metadata.create_all + auto-migrate")

    async with async_session() as session:
        # 2) 确保 admin 用户存在
        result = await session.execute(
            sa_select(User).where(User.username == "admin")
        )
        admin_user = result.scalar_one_or_none()
        if admin_user is None:
            admin_user = User(
                username="admin",
                password_hash=hash_password("admin123"),
                role="admin",
                credits=1000,
            )
            session.add(admin_user)
            await session.commit()
            logger.info("Default admin user created (admin/admin123, credits=1000)")
        else:
            # 保证 admin 角色与最低积分，方便测试
            changed = False
            if admin_user.role != "admin":
                admin_user.role = "admin"
                changed = True
            if admin_user.credits < 100:
                admin_user.credits = max(admin_user.credits, 1000)
                changed = True
            if changed:
                await session.commit()
                logger.info("Existing admin user refreshed (role/credits)")

        # 3) 预置 SystemSettings（仅写入数据库中缺失的 key）
        existing_keys_result = await session.execute(sa_select(SystemSettings.key))
        existing_keys = {row[0] for row in existing_keys_result.all()}

        inserted = 0
        for settings_key in _ENV_DEFAULTS.keys():
            if settings_key in existing_keys:
                continue
            env_value = _get_env_default(settings_key)
            if env_value is None:
                continue  # 值为空则不落库，保持按需懒合并
            session.add(
                SystemSettings(
                    key=settings_key,
                    value={"value": env_value},
                    updated_by=admin_user.id,
                )
            )
            inserted += 1
        if inserted > 0:
            await session.commit()
            logger.info("Pre-seeded %d SystemSettings rows from .env", inserted)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理。"""
    try:
        await _init_database_and_defaults()
    except Exception as exc:
        logger.error("启动初始化失败：%s", exc, exc_info=True)
        raise
    logger.info("CI.AI 后端启动完成，AI 模型默认配置来自 .env，数据库配置优先。")
    yield


app = FastAPI(
    title="CI.AI - AI Video Creation Platform",
    description="AI 视频全流程自动化创作平台后端 API",
    version="0.1.0",
    lifespan=lifespan,
)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """全局异常处理器：将未捕获的异常统一返回 ApiResponse 格式。"""
    logger.error("Unhandled exception on %s %s: %s", request.method, request.url.path, exc)
    logger.debug(traceback.format_exc())
    return JSONResponse(
        status_code=500,
        content={"code": -1, "message": f"Internal Server Error: {exc}", "data": None},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """记录 Pydantic 校验失败的详细字段错误，方便前端排查 422。"""
    try:
        body_preview = (await request.body()).decode("utf-8", errors="replace")[:2000]
    except Exception:
        body_preview = "<unavailable>"
    logger.warning(
        "Validation error on %s %s: errors=%s body=%s",
        request.method,
        request.url.path,
        exc.errors(),
        body_preview,
    )
    return JSONResponse(
        status_code=422,
        content={
            "code": -1,
            "message": "Validation error",
            "detail": exc.errors(),
            "data": None,
        },
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── API v1 路由注册 ──────────────────────────────────────────
API_V1_PREFIX = "/api/v1"

app.include_router(auth.router, prefix=API_V1_PREFIX)
app.include_router(projects.router, prefix=API_V1_PREFIX)
app.include_router(scripts.router, prefix=API_V1_PREFIX)
app.include_router(scenes.router, prefix=API_V1_PREFIX)
app.include_router(shots.router, prefix=API_V1_PREFIX)
app.include_router(characters.router, prefix=API_V1_PREFIX)
app.include_router(environments.router, prefix=API_V1_PREFIX)
app.include_router(styles.router, prefix=API_V1_PREFIX)
app.include_router(generation.router, prefix=API_V1_PREFIX)
app.include_router(image_models.router, prefix=API_V1_PREFIX)
app.include_router(video_models.router, prefix=API_V1_PREFIX)
app.include_router(settings.router, prefix=API_V1_PREFIX)
app.include_router(admin.router, prefix=API_V1_PREFIX)
app.include_router(uploads.router, prefix=API_V1_PREFIX)
app.include_router(exports.router, prefix=API_V1_PREFIX)

# WebSocket 不走 /api/v1 前缀
app.include_router(ws.router)

# ── 静态文件服务（上传的图片等资源） ─────────────────────────────
UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")


@app.get("/health")
async def health_check():
    return {"status": "ok"}
