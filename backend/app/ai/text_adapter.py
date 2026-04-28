"""文本生成 AI 适配器：调用 OpenAI 兼容的 Chat Completions API。"""

import logging

import httpx
from fastapi import HTTPException

logger = logging.getLogger(__name__)


async def generate(
    endpoint: str,
    api_key: str,
    prompt: str,
    model: str = "",
    mode: str = "generate",
    timeout: int = 120,
) -> str:
    """
    调用 OpenAI 兼容的 Chat Completions API 生成文本。

    Args:
        endpoint: API 地址（如 .../chat/completions）
        api_key: API 密钥
        prompt: 输入 prompt
        model: 模型名称
        mode: "generate" 或 "continue"（用于构造 system prompt）
        timeout: 请求超时秒数

    Returns:
        生成的文本内容
    """
    system_message = (
        "你是一名专业的影视编剧助手。请根据用户的提示创作剧本内容。"
        if mode == "generate"
        else "你是一名专业的影视编剧助手。请根据用户的提示续写或修改剧本内容。"
    )

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_message},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.8,
    }

    try:
        async with httpx.AsyncClient(timeout=float(timeout)) as client:
            response = await client.post(endpoint, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()

            # 标准 OpenAI Chat Completions 响应格式
            choices = data.get("choices", [])
            if choices:
                return choices[0].get("message", {}).get("content", "")

            # 兜底：尝试其他可能的响应字段
            return data.get("text", data.get("content", data.get("result", "")))
    except httpx.HTTPStatusError as exc:
        logger.error("Text API returned %s: %s", exc.response.status_code, exc.response.text[:500])
        raise HTTPException(status_code=502, detail=f"Text API error: {exc.response.status_code}")
    except httpx.RequestError as exc:
        logger.error("Text API request failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"Text API unreachable: {exc}")