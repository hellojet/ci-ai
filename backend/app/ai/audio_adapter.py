"""语音合成 AI 适配器：调用外部 TTS API。"""

import logging

import httpx
from fastapi import HTTPException

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 120.0


async def generate(
    endpoint: str,
    api_key: str,
    text: str,
    voice_config: dict | None = None,
) -> str:
    """
    调用语音合成 API。

    Returns:
        音频 URL
    """
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "text": text,
        "voice_config": voice_config or {},
    }

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            response = await client.post(endpoint, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
            return data.get("audio_url", data.get("url", data.get("result", "")))
    except httpx.HTTPStatusError as exc:
        logger.error("Audio API returned %s: %s", exc.response.status_code, exc.response.text)
        raise HTTPException(status_code=502, detail=f"Audio API error: {exc.response.status_code}")
    except httpx.RequestError as exc:
        logger.error("Audio API request failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"Audio API unreachable: {exc}")
