"""视频生成 AI 适配器：调用外部视频生成 API（图生视频）。

当前适配 阿里云 dashscope 通义万相 image-to-video 接口（异步任务模式）：
- POST  /services/aigc/video-generation/video-synthesis  → 提交任务，返回 task_id
- GET   /tasks/{task_id}                                 → 轮询任务状态
- 当 task_status == "SUCCEEDED" 时，从 output.video_url 取最终视频 URL

请求体契约（万相 2.7 i2v 新协议）：
    {
      "model": "wan2.7-i2v",
      "input": {
          "prompt": "...",
          "media": [
              {"type": "first_frame", "url": "https://..."}
          ]
      },
      "parameters": { "duration": 5 }
    }

说明：
- media 是数组，每个元素形如 {type, url}。首帧生视频必须含且仅含一个 type=first_frame 的元素。
- url 必须是网关可直接访问的公网 HTTP/HTTPS URL（或 oss:// 临时 URL），不支持本地相对路径。

请求头契约：
    Authorization: Bearer <api_key>
    Content-Type:  application/json
    X-DashScope-Async: enable
"""

from __future__ import annotations

import asyncio
import logging
import time

import httpx
from fastapi import HTTPException

logger = logging.getLogger(__name__)

# 单次 HTTP 请求超时（提交/查询都很快，不需要 300s）
REQUEST_TIMEOUT = 60.0
# 轮询视频生成任务的最长时间（通义万相 i2v 通常 1~3 分钟，保守给 10 分钟）
POLL_TIMEOUT_SEC = 600
POLL_INTERVAL_SEC = 5

# 限流重试上限与 image_adapter 对齐
MAX_RATE_LIMIT_RETRIES = 10
# 包装式限流的特征（和 image_adapter 保持一致）
_RATE_LIMIT_BODY_MARKERS = (
    "MPE-429",
    "EngineOverloaded",
    "模型提供方限流",
    "rate limit",
    "Too Many Requests",
)


def _compute_retry_delay(attempt: int) -> int:
    """指数退避：5s, 8s, 13s, 20s, 30s, ... 封顶 60s。"""
    return min(60, int(5 * (1.6 ** (attempt - 1))))


def _is_rate_limited(status_code: int, body_text: str) -> bool:
    """识别限流：真 429 / AI 网关把限流包在 4xx~5xx body 里。"""
    if status_code == 429:
        return True
    if status_code in (400, 502, 503) and body_text:
        lower = body_text.lower()
        return any(marker.lower() in lower for marker in _RATE_LIMIT_BODY_MARKERS)
    return False


def _derive_query_endpoint(submit_endpoint: str) -> str:
    """从 submit endpoint 推导出 task 查询 endpoint。

    示例：
        https://host/api/dashscope/v1/services/aigc/video-generation/video-synthesis
        →  https://host/api/dashscope/v1/tasks/{task_id}
    """
    # dashscope 路径规范：.../api/dashscope/v1/services/... → .../api/dashscope/v1/tasks/{id}
    marker = "/v1/"
    idx = submit_endpoint.rfind(marker)
    if idx > 0:
        base = submit_endpoint[: idx + len(marker)]
        return base + "tasks/{task_id}"
    # 兜底：网关另有规则时，交由调用方自行配置（此处返回空串让上层报错）
    return ""


async def _submit_task(
    client: httpx.AsyncClient,
    endpoint: str,
    api_key: str,
    model: str,
    image_url: str,
    prompt: str,
    duration: int,
) -> str:
    """提交视频生成任务，返回 task_id。内部处理限流重试。"""
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "X-DashScope-Async": "enable",
    }
    if not image_url or not image_url.startswith(("http://", "https://", "oss://")):
        raise HTTPException(
            status_code=400,
            detail=(
                "Video API requires an absolute image URL accessible by the AI gateway; "
                f"got: {image_url!r}. Please configure PUBLIC_BASE_URL or upload to object storage."
            ),
        )
    # 外部 AI 网关访问不到本机/内网地址，提前拦截，给出清晰指引
    _lower = image_url.lower()
    if any(token in _lower for token in ("://localhost", "://127.0.0.1", "://0.0.0.0", "://192.168.", "://10.", "host.docker.internal")):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Image URL {image_url!r} points to a local/intranet address that the external AI gateway cannot reach. "
                "Please set PUBLIC_BASE_URL to a public address (e.g. an ngrok tunnel) or upload the image to object storage."
            ),
        )

    payload = {
        "model": model,
        "input": {
            "prompt": prompt or "",
            "media": [
                {"type": "first_frame", "url": image_url},
            ],
        },
        "parameters": {
            "duration": duration,
        },
    }

    attempt = 0
    while True:
        try:
            resp = await client.post(endpoint, json=payload, headers=headers)
        except httpx.RequestError as exc:
            attempt += 1
            if attempt > MAX_RATE_LIMIT_RETRIES:
                logger.error("Video API submit unreachable after %d retries: %s", attempt, exc)
                raise HTTPException(status_code=502, detail=f"Video API unreachable: {exc}")
            delay = _compute_retry_delay(attempt)
            logger.warning("Video API submit 网络异常（第 %d/%d 次），%d 秒后重试... err=%s", attempt, MAX_RATE_LIMIT_RETRIES, delay, exc)
            await asyncio.sleep(delay)
            continue

        if _is_rate_limited(resp.status_code, resp.text):
            attempt += 1
            if attempt > MAX_RATE_LIMIT_RETRIES:
                logger.error("Video API submit rate limited after %d retries. body=%s", attempt, resp.text[:300])
                raise HTTPException(status_code=429, detail="Video API rate limited")
            delay = _compute_retry_delay(attempt)
            logger.warning("Video API 提交限流（第 %d/%d 次），%d 秒后重试... body=%s", attempt, MAX_RATE_LIMIT_RETRIES, delay, resp.text[:200])
            await asyncio.sleep(delay)
            continue

        if resp.status_code >= 400:
            logger.error("Video API submit returned %s: %s", resp.status_code, resp.text[:500])
            raise HTTPException(
                status_code=502,
                detail=f"Video API submit error {resp.status_code}: {resp.text[:200]}",
            )

        try:
            data = resp.json()
        except Exception:
            raise HTTPException(status_code=502, detail=f"Video API returned non-json body: {resp.text[:200]}")

        # dashscope 返回：{ "output": {"task_id": "...", "task_status": "PENDING"}, ... }
        output = data.get("output") or {}
        task_id = output.get("task_id") or data.get("task_id")
        if not task_id:
            raise HTTPException(
                status_code=502,
                detail=f"Video API submit missing task_id: {str(data)[:300]}",
            )
        logger.info("Video task submitted: task_id=%s model=%s", task_id, model)
        return str(task_id)


async def _poll_task(
    client: httpx.AsyncClient,
    query_endpoint_tpl: str,
    api_key: str,
    task_id: str,
) -> str:
    """轮询任务状态直到终态，返回最终 video_url。"""
    headers = {"Authorization": f"Bearer {api_key}"}
    query_url = query_endpoint_tpl.format(task_id=task_id)
    start = time.time()
    rate_limit_attempt = 0

    while True:
        if time.time() - start > POLL_TIMEOUT_SEC:
            raise HTTPException(
                status_code=504,
                detail=f"Video task {task_id} poll timeout after {POLL_TIMEOUT_SEC}s",
            )

        try:
            resp = await client.get(query_url, headers=headers)
        except httpx.RequestError as exc:
            logger.warning("Video task poll network error: %s; retry in %ds", exc, POLL_INTERVAL_SEC)
            await asyncio.sleep(POLL_INTERVAL_SEC)
            continue

        if _is_rate_limited(resp.status_code, resp.text):
            rate_limit_attempt += 1
            if rate_limit_attempt > MAX_RATE_LIMIT_RETRIES:
                raise HTTPException(status_code=429, detail="Video task query rate limited")
            delay = _compute_retry_delay(rate_limit_attempt)
            logger.warning("Video task 查询限流（第 %d/%d 次），%d 秒后重试...", rate_limit_attempt, MAX_RATE_LIMIT_RETRIES, delay)
            await asyncio.sleep(delay)
            continue

        if resp.status_code >= 400:
            logger.error("Video task poll returned %s: %s", resp.status_code, resp.text[:300])
            raise HTTPException(
                status_code=502,
                detail=f"Video task query error {resp.status_code}: {resp.text[:200]}",
            )

        try:
            data = resp.json()
        except Exception:
            raise HTTPException(status_code=502, detail=f"Video task query non-json: {resp.text[:200]}")

        output = data.get("output") or {}
        status = (output.get("task_status") or data.get("task_status") or "").upper()

        if status == "SUCCEEDED":
            video_url = (
                output.get("video_url")
                or data.get("video_url")
                or data.get("url")
                or ""
            )
            if not video_url:
                raise HTTPException(
                    status_code=502,
                    detail=f"Video task {task_id} succeeded but no video_url: {str(data)[:300]}",
                )
            logger.info("Video task %s succeeded: %s", task_id, video_url)
            return video_url

        if status in ("FAILED", "UNKNOWN", "CANCELED"):
            msg = output.get("message") or output.get("code") or str(data)[:300]
            raise HTTPException(
                status_code=502,
                detail=f"Video task {task_id} {status}: {msg}",
            )

        # PENDING / RUNNING：继续轮询
        logger.debug("Video task %s status=%s, waiting %ds...", task_id, status or "?", POLL_INTERVAL_SEC)
        await asyncio.sleep(POLL_INTERVAL_SEC)


async def generate(
    endpoint: str,
    api_key: str,
    model: str,
    image_url: str,
    prompt: str = "",
    duration: int = 5,
) -> str:
    """调用视频生成 API（图生视频，异步任务模式）。

    Args:
        endpoint: dashscope 视频生成提交接口 URL
        api_key: API Key
        model: 模型名，如 "wan2.7-i2v"
        image_url: 输入图片 URL（必须是网关可访问的 URL）
        prompt: 文本提示词
        duration: 视频时长（秒），默认 5

    Returns:
        视频 URL（网关返回的 CDN 地址）
    """
    if not model:
        raise HTTPException(status_code=400, detail="Video model is required (api.video.model)")
    query_tpl = _derive_query_endpoint(endpoint)
    if not query_tpl:
        raise HTTPException(
            status_code=500,
            detail=f"Cannot derive task query endpoint from: {endpoint}",
        )

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        task_id = await _submit_task(
            client=client,
            endpoint=endpoint,
            api_key=api_key,
            model=model,
            image_url=image_url,
            prompt=prompt,
            duration=duration,
        )
        return await _poll_task(
            client=client,
            query_endpoint_tpl=query_tpl,
            api_key=api_key,
            task_id=task_id,
        )
