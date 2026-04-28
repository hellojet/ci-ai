"""WebSocket 路由：项目级实时通信。"""

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt

from app.config import get_settings
from app.websocket.manager import manager

router = APIRouter()


@router.websocket("/ws/{project_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    project_id: int,
    token: str = Query(...),
):
    settings = get_settings()
    try:
        payload = jwt.decode(
            token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
        )
        user_id = int(payload.get("sub", 0))
        if not user_id:
            await websocket.close(code=4001)
            return
    except (JWTError, ValueError):
        await websocket.close(code=4001)
        return

    await manager.connect(websocket, project_id, user_id)
    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")
            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})
            else:
                await manager.broadcast(
                    project_id,
                    {"type": msg_type, "data": data.get("data", {}), "from_user": user_id},
                )
    except WebSocketDisconnect:
        manager.disconnect(project_id, user_id)
    except Exception:
        manager.disconnect(project_id, user_id)
