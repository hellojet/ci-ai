"""视频生成 AI 适配器：调用外部视频生成 API（图生视频）。"""

import logging

import httpx
from fastapi import HTTPException

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 300.0


async def generate(
    endpoint: str,
    api_key: str,
    image_url: str,
    prompt: str = "",
    duration: int = 5,
) -> str:
    """
    调用视频生成 API（图生视频）。

    Returns:
        视频 URL
    """
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "image_url": image_url,
        "prompt": prompt,
        "duration": duration,
    }

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            response = await client.post(endpoint, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
            return data.get("video_url", data.get("url", data.get("result", "")))
    except httpx.HTTPStatusError as exc:
        logger.error("Video API returned %s: %s", exc.response.status_code, exc.response.text)
        raise HTTPException(status_code=502, detail=f"Video API error: {exc.response.status_code}")
    except httpx.RequestError as exc:
        logger.error("Video API request failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"Video API unreachable: {exc}")
