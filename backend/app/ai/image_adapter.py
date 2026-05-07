"""图片生成 AI 适配器：调用外部图片生成 API。

支持两种协议（由上层按模型清单中的 protocol 字段选择调用哪一个）：

1) images_generations（OpenAI /images/generations，默认，gpt-image-2 等）
   - 入口：generate / generate_sync
   - 契约（实测可用，2026-05-01 验证）：
        {"model":"gpt-image-2","prompt":"...","n":1,"size":"1536x1024","quality":"high",
         "image":[{"type":"input_image","image_url":"http://.../xxx.jpg"}]}
   - 响应：data[0] = {url: null, b64_json: "...", revised_prompt: "..."}

2) chat_completions_modalities（新：Gemini 系列图像模型）
   - 入口：generate_sync_via_chat
   - 契约（用户 2026-05-06 提供的 curl 示例）：
        POST /api/fai/v1/chat/completions
        {"model":"gemini-2.5-flash-image-preview",
         "messages":[{"role":"user","content":"..."}],
         "modalities":["TEXT","IMAGE"]}
   - 响应形如标准 Chat Completions，图片以 base64 内嵌在 message.images[] 或
     message.content 的 multimodal 分段里；本适配器会尝试多种常见位置。

落盘策略（两种协议共用）：
- 优先上传到七牛云（qiniu_storage），返回公网 CDN 绝对 URL，供下游视频生成等外部 AI 网关直接拉取
- 七牛未配置或上传失败时，降级为写入本地 uploads/generated/ 目录，返回 /uploads/generated/xxx.png 相对路径
"""

import asyncio
import base64
import logging
import os
import time
import uuid

import httpx
from fastapi import HTTPException

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 300.0

VALID_SIZES = {"1024x1024", "1024x1536", "1536x1024"}

UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads", "generated")
os.makedirs(UPLOADS_DIR, exist_ok=True)


def _is_qiniu_configured() -> bool:
    """判断七牛云是否已完整配置。"""
    from app.config import get_settings

    settings = get_settings()
    return bool(
        settings.qiniu_access_key
        and settings.qiniu_secret_key
        and settings.qiniu_bucket
        and settings.qiniu_domain
    )

# 最多做多少次限流内部重试。
# 之前是 10 次、退避封顶 60s，极端情况下单个 view 会被重试 10+ 分钟，用户体验差。
# 现在改成 2 次、封顶 15s，保证最坏约 3s + 5s + 8s + 单次请求耗时 ≈ 15-20s 就能快速失败。
MAX_RATE_LIMIT_RETRIES = 2
_MAX_RETRY_DELAY_SECONDS = 15

# 包装式限流的特征：AI 网关把限流包在 HTTP 400 的 body 里
_RATE_LIMIT_BODY_MARKERS = ("MPE-429", "EngineOverloaded", "模型提供方限流", "rate limit", "Too Many Requests")


def _compute_retry_delay(attempt: int) -> int:
    """指数退避：3s, 5s, 8s, 13s, ...，封顶 _MAX_RETRY_DELAY_SECONDS。"""
    return min(_MAX_RETRY_DELAY_SECONDS, max(3, int(3 * (1.6 ** (attempt - 1)))))


def _is_rate_limited(status_code: int, body_text: str) -> bool:
    """识别限流：真 429 / AI 网关把限流包在 400 body 里（MPE-429 / EngineOverloaded 等）。"""
    if status_code == 429:
        return True
    if status_code in (400, 502, 503) and body_text:
        lower = body_text.lower()
        return any(marker.lower() in lower for marker in _RATE_LIMIT_BODY_MARKERS)
    return False


def _fetch_image_as_data_url(image_url: str, timeout: float = 30.0) -> str:
    """把参考图下载下来转成 data:image/...;base64,xxx 协议串。

    ⚠️ 降级保留：当前上游已支持直接透传 http url，
    因此 generate_sync / generate 默认都不会调用本函数。保留这里是为了将来切换
    到只接受 data URL 的端点时能即刻降级——改一行参数即可。

    - 支持 http / https 公网 URL
    - 根据响应头 Content-Type 推断 mime；拿不到就按文件扩展名兜底为 png
    - 失败抛 HTTPException，让上层决定是否降级为纯文生图
    """
    if not image_url:
        raise HTTPException(status_code=400, detail="reference image url is empty")

    try:
        with httpx.Client(timeout=timeout, follow_redirects=True) as client:
            resp = client.get(image_url)
            resp.raise_for_status()
            content_type = (resp.headers.get("Content-Type") or "").split(";")[0].strip().lower()
            if not content_type or not content_type.startswith("image/"):
                # 按扩展名兜底
                ext = (image_url.rsplit(".", 1)[-1] or "png").lower().split("?")[0]
                content_type = f"image/{ext if ext in ('png', 'jpg', 'jpeg', 'webp', 'gif') else 'png'}"
            b64 = base64.b64encode(resp.content).decode("ascii")
            return f"data:{content_type};base64,{b64}"
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"fetch reference image failed: {type(exc).__name__}: {exc}",
        ) from exc


def _build_payload(
    prompt: str,
    negative_prompt: str,
    width: int,
    height: int,
    count: int,
    reference_images: list[str] | None = None,
) -> dict:
    """构建 OpenAI 图片生成 API 请求 payload。

    当 reference_images 非空时，按上游契约加 image 字段：
        "image": [{"type": "input_image", "image_url": <http url 或 data URL>}, ...]
    经实测，上游两种形式都能接受，我们优先传 http url 以减小请求体。
    """
    size_str = f"{width}x{height}"
    if size_str not in VALID_SIZES:
        size_str = "1536x1024"

    payload: dict = {
        "model": "gpt-image-2",
        "prompt": prompt,
        "n": count,
        "size": size_str,
        "quality": "medium",
    }

    if reference_images:
        payload["image"] = [
            {"type": "input_image", "image_url": url}
            for url in reference_images
            if url
        ]
        # 有参考图时通常需要更高质量，契约示例里 quality=high
        payload["quality"] = "high"

    return payload


def _save_base64_image(b64_data: str) -> str:
    """持久化 base64 图片，返回可访问的 URL。

    优先上传七牛云（返回公网 CDN URL，视频生成等外部 AI 网关可直接访问）；
    若七牛未配置或上传异常，降级为本地文件，返回 /uploads/generated/xxx.png。
    """
    image_bytes = base64.b64decode(b64_data)

    # 优先七牛：视频生成需要公网可达的图片 URL
    if _is_qiniu_configured():
        try:
            from app.services.qiniu_storage import upload_bytes

            url = upload_bytes(image_bytes, extension="png", folder="generated")
            logger.info("Saved generated image to qiniu: %s (%d bytes)", url, len(image_bytes))
            return url
        except Exception as exc:
            # 七牛偶发失败不能阻塞图片生成，降级本地
            logger.warning("Qiniu upload failed, falling back to local storage: %s", exc)

    filename = f"{uuid.uuid4().hex}.png"
    filepath = os.path.join(UPLOADS_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(image_bytes)
    logger.info("Saved generated image locally: %s (%d bytes)", filepath, len(image_bytes))
    return f"/uploads/generated/{filename}"


def _parse_response(data: dict) -> list[str]:
    """从 API 响应中解析图片，返回 URL 列表。"""
    if "data" not in data or not isinstance(data["data"], list):
        urls = data.get("images", data.get("urls", data.get("result", [])))
        if isinstance(urls, list):
            return urls
        return [urls] if urls else []

    results = []
    for item in data["data"]:
        if isinstance(item, str):
            results.append(item)
            continue
        if not isinstance(item, dict):
            continue

        url = item.get("url")
        if url:
            results.append(url)
            continue

        b64_data = item.get("b64_json")
        if b64_data:
            local_url = _save_base64_image(b64_data)
            results.append(local_url)

    return results


def generate_sync(
    endpoint: str,
    api_key: str,
    prompt: str,
    negative_prompt: str = "",
    width: int = 1024,
    height: int = 576,
    count: int = 1,
    reference_image_url: str | None = None,
    reference_image_urls: list[str] | None = None,
) -> list[str]:
    """同步调用图片生成 API（供 Celery worker 使用）。

    - reference_image_urls 优先于 reference_image_url；images_generations 协议
      实测支持多图参考（payload.image 为数组），因此这里全部透传给上游。
    - 单值参数 reference_image_url 仅作向下兼容。
    - 包含内部限流重试：识别 AI 网关包装式限流（HTTP 400/429 + body MPE-429/EngineOverloaded），
      按指数退避重试最多 MAX_RATE_LIMIT_RETRIES 次。
    """
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    # 实测上游直接接受 http url，不需要我们先下载成 base64 data URL，
    # 这样：①请求体从 ~180KB 降到 <1KB，②网关侧省去 base64 解码开销，③避免我们多花一次下载。
    # 如果未来遇到只支持 base64 的端点，可以改用 _fetch_image_as_data_url() 降级。
    ref_urls: list[str] = [u for u in (reference_image_urls or []) if u]
    if not ref_urls and reference_image_url:
        ref_urls = [reference_image_url]

    payload = _build_payload(prompt, negative_prompt, width, height, count, ref_urls)

    logger.info(
        "Image API request: endpoint=%s, model=%s, size=%s, n=%d, ref_images=%d, prompt=%.80s...",
        endpoint, payload["model"], payload["size"], count, len(ref_urls), prompt,
    )

    attempt = 0
    while True:
        try:
            with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
                response = client.post(endpoint, json=payload, headers=headers)

                # 先检查限流（可能是真 429，也可能是被包装进 400 body 的 MPE-429）
                if _is_rate_limited(response.status_code, response.text):
                    attempt += 1
                    if attempt > MAX_RATE_LIMIT_RETRIES:
                        logger.error(
                            "Image API rate limited after %d retries, giving up. body=%.200s",
                            MAX_RATE_LIMIT_RETRIES, response.text,
                        )
                        raise HTTPException(
                            status_code=429,
                            detail=f"Image API rate limited after {MAX_RATE_LIMIT_RETRIES} retries",
                        )
                    delay = _compute_retry_delay(attempt)
                    logger.warning(
                        "Image API 限流（第 %d/%d 次），%d 秒后重试... body=%.120s",
                        attempt, MAX_RATE_LIMIT_RETRIES, delay, response.text,
                    )
                    time.sleep(delay)
                    continue

                response.raise_for_status()
                data = response.json()
                logger.info("Image API response keys: %s", list(data.keys()))
                urls = _parse_response(data)
                logger.info("Image API generated %d images", len(urls))
                return urls
        except HTTPException:
            raise
        except httpx.HTTPStatusError as exc:
            logger.error("Image API returned %s: %s", exc.response.status_code, exc.response.text)
            raise HTTPException(
                status_code=502, detail=f"Image API error: {exc.response.status_code}"
            )
        except httpx.RequestError as exc:
            # 网络瞬时错误（含 Server disconnected / ReadTimeout / ConnectError 等）
            # 独立计数，避免跟真限流共用 attempt 导致双重惩罚；但上限共用 MAX_RATE_LIMIT_RETRIES
            attempt += 1
            if attempt > MAX_RATE_LIMIT_RETRIES:
                logger.error(
                    "Image API 网络错误超过 %d 次重试仍失败，放弃。错误类型=%s err=%s",
                    MAX_RATE_LIMIT_RETRIES, type(exc).__name__, exc,
                )
                raise HTTPException(
                    status_code=502,
                    detail=f"Image API unreachable ({type(exc).__name__}): {exc}",
                )
            delay = _compute_retry_delay(attempt)
            logger.warning(
                "Image API 网络错误（第 %d/%d 次，非限流），%d 秒后重试... 错误类型=%s err=%s",
                attempt, MAX_RATE_LIMIT_RETRIES, delay, type(exc).__name__, exc,
            )
            time.sleep(delay)
            continue


async def generate(
    endpoint: str,
    api_key: str,
    prompt: str,
    negative_prompt: str = "",
    width: int = 1024,
    height: int = 576,
    count: int = 4,
    reference_image_url: str | None = None,
    reference_image_urls: list[str] | None = None,
) -> list[str]:
    """异步调用图片生成 API（供 FastAPI 路由使用）。

    - reference_image_urls 优先于 reference_image_url；多图时全部透传给 payload.image 数组。
    - 与 generate_sync 对齐的限流重试契约：识别 AI 网关包装式限流
      （HTTP 400/429 + body MPE-429/EngineOverloaded），指数退避最多 MAX_RATE_LIMIT_RETRIES 次。
    """
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    # 同 generate_sync：直接透传 http url，避免 base64 开销。详见 generate_sync 里的说明。
    ref_urls: list[str] = [u for u in (reference_image_urls or []) if u]
    if not ref_urls and reference_image_url:
        ref_urls = [reference_image_url]

    payload = _build_payload(prompt, negative_prompt, width, height, count, ref_urls)

    attempt = 0
    while True:
        try:
            async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
                response = await client.post(endpoint, json=payload, headers=headers)

                if _is_rate_limited(response.status_code, response.text):
                    attempt += 1
                    if attempt > MAX_RATE_LIMIT_RETRIES:
                        logger.error(
                            "Image API rate limited after %d retries, giving up. body=%.200s",
                            MAX_RATE_LIMIT_RETRIES, response.text,
                        )
                        raise HTTPException(
                            status_code=429,
                            detail=f"Image API rate limited after {MAX_RATE_LIMIT_RETRIES} retries",
                        )
                    delay = _compute_retry_delay(attempt)
                    logger.warning(
                        "Image API 限流（第 %d/%d 次），%d 秒后重试... body=%.120s",
                        attempt, MAX_RATE_LIMIT_RETRIES, delay, response.text,
                    )
                    await asyncio.sleep(delay)
                    continue

                response.raise_for_status()
                data = response.json()
                return _parse_response(data)
        except HTTPException:
            raise
        except httpx.HTTPStatusError as exc:
            logger.error("Image API returned %s: %s", exc.response.status_code, exc.response.text)
            raise HTTPException(
                status_code=502, detail=f"Image API error: {exc.response.status_code}"
            )
        except httpx.RequestError as exc:
            attempt += 1
            if attempt > MAX_RATE_LIMIT_RETRIES:
                logger.error(
                    "Image API 网络错误超过 %d 次重试仍失败，放弃。错误类型=%s err=%s",
                    MAX_RATE_LIMIT_RETRIES, type(exc).__name__, exc,
                )
                raise HTTPException(
                    status_code=502,
                    detail=f"Image API unreachable ({type(exc).__name__}): {exc}",
                )
            delay = _compute_retry_delay(attempt)
            logger.warning(
                "Image API 网络错误（第 %d/%d 次，非限流），%d 秒后重试... 错误类型=%s err=%s",
                attempt, MAX_RATE_LIMIT_RETRIES, delay, type(exc).__name__, exc,
            )
            await asyncio.sleep(delay)
            continue


# ── Chat Completions + modalities 协议（Gemini 系列图像模型） ──────────────────

def _extract_images_from_chat_response(data: dict) -> list[str]:
    """从 Chat Completions 响应中提取图片，返回可访问的 URL 列表。

    上游目前观察到的几种可能形态，都做兼容：
      A) choices[0].message.images = [{"image_url":{"url":"data:image/png;base64,..."}}, ...]
      B) choices[0].message.content = [
             {"type":"text","text":"..."},
             {"type":"image_url","image_url":{"url":"data:image/..."}},
         ]
      C) choices[0].message.content = "data:image/png;base64,xxx"（单字符串，少见）
      D) 顶层 data=[{b64_json:"..."}]（保险起见兜一下）
    """
    results: list[str] = []

    def _consume_url_like(value: str) -> None:
        if not value:
            return
        if value.startswith("http://") or value.startswith("https://"):
            results.append(value)
        elif value.startswith("data:"):
            # data:image/png;base64,xxxx
            try:
                b64 = value.split(",", 1)[1]
            except IndexError:
                return
            results.append(_save_base64_image(b64))
        else:
            # 兜底当作 base64
            try:
                results.append(_save_base64_image(value))
            except Exception:  # noqa: BLE001 - 仅用于宽容解析
                pass

    choices = data.get("choices") or []
    if choices:
        message = (choices[0] or {}).get("message") or {}

        # A) message.images
        images_field = message.get("images")
        if isinstance(images_field, list):
            for item in images_field:
                if not isinstance(item, dict):
                    continue
                image_url = item.get("image_url")
                if isinstance(image_url, dict):
                    _consume_url_like(image_url.get("url", ""))
                elif isinstance(image_url, str):
                    _consume_url_like(image_url)
                elif item.get("b64_json"):
                    results.append(_save_base64_image(item["b64_json"]))

        # B) message.content 是 multimodal 数组
        content = message.get("content")
        if isinstance(content, list):
            for part in content:
                if not isinstance(part, dict):
                    continue
                if part.get("type") in ("image_url", "output_image", "image"):
                    image_url = part.get("image_url") or part.get("url")
                    if isinstance(image_url, dict):
                        _consume_url_like(image_url.get("url", ""))
                    elif isinstance(image_url, str):
                        _consume_url_like(image_url)
                elif part.get("b64_json"):
                    results.append(_save_base64_image(part["b64_json"]))

        # C) content 是单一字符串且看上去是 data/http url
        if isinstance(content, str) and (content.startswith("data:") or content.startswith("http")):
            _consume_url_like(content)

    # D) 顶层 data 兜底
    if not results and isinstance(data.get("data"), list):
        for item in data["data"]:
            if isinstance(item, dict):
                if item.get("url"):
                    _consume_url_like(item["url"])
                elif item.get("b64_json"):
                    results.append(_save_base64_image(item["b64_json"]))

    return results


def _build_chat_messages(
    prompt: str,
    reference_image_url: str | None = None,
    reference_image_urls: list[str] | None = None,
) -> list[dict]:
    """构造 Chat Completions 的 messages。

    - 多图 (reference_image_urls 非空) 时：content 按 [text, image_url, image_url, ...] 排布
    - 单图 (仅传 reference_image_url) 时：content 为 [text, image_url]
    - 无参考图时：content 为纯字符串 prompt（走文生图）
    """
    urls: list[str] = [u for u in (reference_image_urls or []) if u]
    if not urls and reference_image_url:
        urls = [reference_image_url]

    if not urls:
        return [{"role": "user", "content": prompt}]

    content: list[dict] = [{"type": "text", "text": prompt}]
    for url in urls:
        content.append({"type": "image_url", "image_url": {"url": url}})
    return [{"role": "user", "content": content}]


def generate_sync_via_chat(
    endpoint: str,
    api_key: str,
    model: str,
    prompt: str,
    count: int = 1,
    reference_image_url: str | None = None,
    reference_image_urls: list[str] | None = None,
) -> list[str]:
    """走 Chat Completions + modalities=["TEXT","IMAGE"] 协议生成图片（Gemini 系列）。

    - reference_image_urls 支持多图参考（该协议原生支持 multimodal content 数组）
    - reference_image_url 仅用于向下兼容
    - count 参数当前协议不原生支持批量，故采用"多次单图"循环实现
    """
    if not model:
        raise HTTPException(status_code=400, detail="image model is required for chat_completions_modalities protocol")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json;charset=UTF-8",
    }
    ref_urls: list[str] = [u for u in (reference_image_urls or []) if u]
    if not ref_urls and reference_image_url:
        ref_urls = [reference_image_url]
    logger.info(
        "Chat-image API request: endpoint=%s, model=%s, n=%d, ref_images=%d, prompt=%.80s...",
        endpoint, model, count, len(ref_urls), prompt,
    )
    payload_base = {
        "model": model,
        "messages": _build_chat_messages(prompt, reference_image_urls=ref_urls),
        "modalities": ["TEXT", "IMAGE"],
    }

    all_urls: list[str] = []
    for call_idx in range(max(1, count)):
        attempt = 0
        while True:
            try:
                with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
                    response = client.post(endpoint, json=payload_base, headers=headers)

                    if _is_rate_limited(response.status_code, response.text):
                        attempt += 1
                        if attempt > MAX_RATE_LIMIT_RETRIES:
                            logger.error(
                                "Chat-image API rate limited after %d retries, giving up. body=%.200s",
                                MAX_RATE_LIMIT_RETRIES, response.text,
                            )
                            raise HTTPException(
                                status_code=429,
                                detail=f"Image API rate limited after {MAX_RATE_LIMIT_RETRIES} retries",
                            )
                        delay = _compute_retry_delay(attempt)
                        logger.warning(
                            "Chat-image API 限流（第 %d/%d 次），%d 秒后重试... body=%.120s",
                            attempt, MAX_RATE_LIMIT_RETRIES, delay, response.text,
                        )
                        time.sleep(delay)
                        continue

                    response.raise_for_status()
                    data = response.json()
                    logger.info(
                        "Chat-image API response (call %d/%d) keys=%s",
                        call_idx + 1, count, list(data.keys()),
                    )
                    urls = _extract_images_from_chat_response(data)
                    if not urls:
                        # 上游没返回图片时，把 body 截断写到日志里帮助排查
                        logger.error(
                            "Chat-image API returned no images. model=%s body=%.500s",
                            model, response.text,
                        )
                        raise HTTPException(
                            status_code=502,
                            detail="Image API returned no image (empty choices[0].message.images)",
                        )
                    all_urls.extend(urls)
                    break
            except HTTPException:
                raise
            except httpx.HTTPStatusError as exc:
                logger.error(
                    "Chat-image API returned %s: %s",
                    exc.response.status_code, exc.response.text,
                )
                raise HTTPException(
                    status_code=502,
                    detail=f"Image API error: {exc.response.status_code}",
                )
            except httpx.RequestError as exc:
                attempt += 1
                if attempt > MAX_RATE_LIMIT_RETRIES:
                    logger.error(
                        "Chat-image API 网络错误超过 %d 次重试仍失败，放弃。错误类型=%s err=%s",
                        MAX_RATE_LIMIT_RETRIES, type(exc).__name__, exc,
                    )
                    raise HTTPException(
                        status_code=502,
                        detail=f"Image API unreachable ({type(exc).__name__}): {exc}",
                    )
                delay = _compute_retry_delay(attempt)
                logger.warning(
                    "Chat-image API 网络错误（第 %d/%d 次，非限流），%d 秒后重试... 错误类型=%s err=%s",
                    attempt, MAX_RATE_LIMIT_RETRIES, delay, type(exc).__name__, exc,
                )
                time.sleep(delay)
                continue

    return all_urls