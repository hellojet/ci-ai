"""文本生成 AI 适配器：调用外部文本生成 API。"""

import logging

import httpx
from fastapi import HTTPException

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 120.0


async def generate(
    endpoint: str,
    api_key: str,
    prompt: str,
    mode: str = "generate",
) -> str:
    """
    调用文本生成 API。

    Args:
        endpoint: API 地址
        api_key: API 密钥
        prompt: 输入 prompt
        mode: "generate" 或 "continue"

    Returns:
        生成的文本内容
    """
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {"prompt": prompt, "mode": mode}

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            response = await client.post(endpoint, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
            return data.get("text", data.get("content", data.get("result", "")))
    except httpx.HTTPStatusError as exc:
        logger.error("Text API returned %s: %s", exc.response.status_code, exc.response.text)
        raise HTTPException(status_code=502, detail=f"Text API error: {exc.response.status_code}")
    except httpx.RequestError as exc:
        logger.error("Text API request failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"Text API unreachable: {exc}")
