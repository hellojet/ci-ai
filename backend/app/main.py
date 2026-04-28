"""CI.AI 后端 FastAPI 应用入口。"""

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from app.database import async_session
from app.models.system_settings import SystemSettings

from app.routers import (
    admin,
    auth,
    characters,
    environments,
    exports,
    generation,
    project_lock,
    projects,
    scenes,
    scripts,
    settings,
    shots,
    styles,
    uploads,
    ws,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

logger = logging.getLogger(__name__)

# ── 默认 API 配置 ────────────────────────────────────────────
DEFAULT_API_SETTINGS: dict[str, str | int] = {
    # 文本生成
    "api.text.endpoint": "https://trip-llm.alibaba-inc.com/api/fai/v1/chat/completions",
    "api.text.model": "deepseek-v4-flash",
    "api.text.api_key": "fai-2-632-f20b438c8a82",
    "api.text.concurrency": 3,
    "api.text.timeout": 120,
    # 图像生成
    "api.image.endpoint": "https://trip-llm.alibaba-inc.com/api/openai/v1/images/generations",
    "api.image.model": "gpt-image-2",
    "api.image.api_key": "fai-2-632-f20b438c8a82",
    "api.image.concurrency": 2,
    "api.image.timeout": 180,
    # 视频生成
    "api.video.endpoint": "https://trip-llm.alibaba-inc.com/api/dashscope/v1/services/aigc/video-generation/video-synthesis",
    "api.video.model": "wan2.7-i2v",
    "api.video.api_key": "fai-2-632-f20b438c8a82",
    "api.video.concurrency": 1,
    "api.video.timeout": 300,
    # 音频生成（暂未配置具体 API，仅预留默认值）
    "api.audio.endpoint": "",
    "api.audio.model": "",
    "api.audio.api_key": "",
    "api.audio.concurrency": 1,
    "api.audio.timeout": 120,
}


async def init_default_settings() -> None:
    """应用启动时，将默认 API 配置写入数据库（仅当 key 不存在时）。"""
    async with async_session() as session:
        inserted_count = 0
        for key, value in DEFAULT_API_SETTINGS.items():
            result = await session.execute(
                select(SystemSettings).where(SystemSettings.key == key)
            )
            if result.scalar_one_or_none() is None:
                session.add(SystemSettings(key=key, value={"value": value}))
                inserted_count += 1
        if inserted_count > 0:
            await session.commit()
            logger.info("已初始化 %d 项默认 API 配置", inserted_count)
        else:
            logger.info("默认 API 配置已存在，跳过初始化")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理。"""
    await init_default_settings()
    yield


app = FastAPI(
    title="CI.AI - AI Video Creation Platform",
    description="AI 视频全流程自动化创作平台后端 API",
    version="0.1.0",
    lifespan=lifespan,
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
app.include_router(project_lock.router, prefix=API_V1_PREFIX)
app.include_router(scripts.router, prefix=API_V1_PREFIX)
app.include_router(scenes.router, prefix=API_V1_PREFIX)
app.include_router(shots.router, prefix=API_V1_PREFIX)
app.include_router(characters.router, prefix=API_V1_PREFIX)
app.include_router(environments.router, prefix=API_V1_PREFIX)
app.include_router(styles.router, prefix=API_V1_PREFIX)
app.include_router(generation.router, prefix=API_V1_PREFIX)
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
