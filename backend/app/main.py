"""CI.AI 后端 FastAPI 应用入口。"""

import logging
import os
import traceback
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理。"""
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
