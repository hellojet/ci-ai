"""图片生成 AI 适配器：调用外部图片生成 API。"""

import logging

import httpx
from fastapi import HTTPException

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 180.0


async def generate(
    endpoint: str,
    api_key: str,
    prompt: str,
    negative_prompt: str = "",
    width: int = 1024,
    height: int = 576,
    count: int = 4,
) -> list[str]:
    """
    调用图片生成 API。

    Returns:
        图片 URL 列表
    """
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "prompt": prompt,
        "negative_prompt": negative_prompt,
        "width": width,
        "height": height,
        "num_images": count,
    }

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            response = await client.post(endpoint, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
            # 兼容多种返回格式
            urls = data.get("images", data.get("urls", data.get("result", [])))
            if isinstance(urls, list):
                return urls
            return [urls] if urls else []
    except httpx.HTTPStatusError as exc:
        logger.error("Image API returned %s: %s", exc.response.status_code, exc.response.text)
        raise HTTPException(status_code=502, detail=f"Image API error: {exc.response.status_code}")
    except httpx.RequestError as exc:
        logger.error("Image API request failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"Image API unreachable: {exc}")
