"""视频模型清单服务。

清单来自 .env 的 AI_VIDEO_MODELS（JSON 字符串）。为兼容老部署，当 AI_VIDEO_MODELS
为空时，自动用 ai_video_endpoint / ai_video_model / ai_video_api_key 合成一条默认项。

模型项字段约定（与 image_models_service 同构）：
- id:           str，唯一标识；前端生成请求里会回传这个 id
- label:        str，技术展示名（如 "HappyHorse 1.0 I2V"）
- display_name: Optional[str]，前端展示给用户的产品名/俗称（如 "快马 1.0"）；为空时前端回退到 label
- endpoint:     str，dashscope 视频提交接口完整 URL
- api_key:      str，Bearer Token（不会返回到前端）
- model:        str，实际传给上游的 model 名（如 "happyhorse-1.0-i2v"）
- protocol:     "dashscope_async_i2v"（dashscope 异步任务模式：submit + poll）
- default:      bool，默认选中的模型
"""

from __future__ import annotations

import json
import logging
from typing import Optional

from app.config import get_settings

logger = logging.getLogger(__name__)

# 当前只支持一种协议；后续若接入新协议（如 sync 模式）在这里加白名单即可。
SUPPORTED_PROTOCOLS = {"dashscope_async_i2v"}


def _load_raw_models() -> list[dict]:
    """从 .env 解析 AI_VIDEO_MODELS；解析失败或为空时回落到单条默认模型。"""
    settings = get_settings()
    raw = (settings.ai_video_models or "").strip()

    models: list[dict] = []
    if raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                models = [m for m in parsed if isinstance(m, dict)]
            else:
                logger.warning("AI_VIDEO_MODELS is not a JSON array, ignored: %.200s", raw)
        except json.JSONDecodeError as exc:
            logger.error("AI_VIDEO_MODELS JSON decode failed: %s; raw=%.200s", exc, raw)

    if not models:
        # 回落：用单独的 AI_VIDEO_* 变量合成一条默认模型
        if settings.ai_video_endpoint and settings.ai_video_api_key:
            models = [
                {
                    "id": settings.ai_video_model or "default",
                    "label": settings.ai_video_model or "Default Video Model",
                    "endpoint": settings.ai_video_endpoint,
                    "api_key": settings.ai_video_api_key,
                    "model": settings.ai_video_model or "",
                    "protocol": "dashscope_async_i2v",
                    "default": True,
                }
            ]

    # 规范化 & 过滤非法项
    normalized: list[dict] = []
    for m in models:
        mid = str(m.get("id") or "").strip()
        endpoint = str(m.get("endpoint") or "").strip()
        api_key = str(m.get("api_key") or "").strip()
        if not mid or not endpoint or not api_key:
            logger.warning("Skipping malformed video model entry: %s", m)
            continue
        protocol = str(m.get("protocol") or "dashscope_async_i2v").strip()
        if protocol not in SUPPORTED_PROTOCOLS:
            logger.warning(
                "Video model %s has unsupported protocol=%s, skipped", mid, protocol,
            )
            continue
        raw_display_name = str(m.get("display_name") or "").strip()
        normalized.append(
            {
                "id": mid,
                "label": str(m.get("label") or mid),
                "display_name": raw_display_name or None,
                "endpoint": endpoint,
                "api_key": api_key,
                "model": str(m.get("model") or mid),
                "protocol": protocol,
                "default": bool(m.get("default", False)),
                "supports_audio": bool(m.get("supports_audio", False)),
            }
        )

    # 如果没有 default 且至少有一条，把第一条设为 default
    if normalized and not any(m["default"] for m in normalized):
        normalized[0]["default"] = True

    return normalized


def list_models_for_client() -> list[dict]:
    """返回给前端的字段子集：不带 api_key / endpoint。"""
    return [
        {
            "id": m["id"],
            "label": m["label"],
            "display_name": m.get("display_name"),
            "protocol": m["protocol"],
            "default": m["default"],
            "supports_audio": m.get("supports_audio", False),
        }
        for m in _load_raw_models()
    ]


def get_model_by_id(model_id: Optional[str], strict: bool = False) -> Optional[dict]:
    """按 id 查找完整模型配置。

    - strict=True：传了 id 但找不到就直接返回 None（用于 service 层校验），
      避免把用户的显式选择偷偷回退成默认模型。
    - strict=False：传了 id 但找不到时回退到默认模型（用于 worker 容错），
      model_id 为空也返回默认模型。
    """
    models = _load_raw_models()
    if not models:
        return None
    if model_id:
        for m in models:
            if m["id"] == model_id:
                return m
        if strict:
            return None
        logger.warning("Video model id=%s not found, falling back to default", model_id)
    for m in models:
        if m["default"]:
            return m
    return models[0]


def get_default_model() -> Optional[dict]:
    """返回默认视频模型（AI_VIDEO_MODELS 中 default=true 的那条；没有则第一条）。"""
    models = _load_raw_models()
    if not models:
        return None
    for m in models:
        if m["default"]:
            return m
    return models[0]
