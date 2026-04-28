"""WebSocket 连接管理器：按 project_id 分组管理连接。"""

import logging

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """管理 WebSocket 连接，支持按项目广播和定向发送。"""

    def __init__(self):
        self.connections: dict[int, dict[int, WebSocket]] = {}

    async def connect(self, websocket: WebSocket, project_id: int, user_id: int):
        await websocket.accept()
        if project_id not in self.connections:
            self.connections[project_id] = {}
        self.connections[project_id][user_id] = websocket
        logger.info("WebSocket connected: project=%d, user=%d", project_id, user_id)

    def disconnect(self, project_id: int, user_id: int):
        if project_id in self.connections:
            self.connections[project_id].pop(user_id, None)
            if not self.connections[project_id]:
                del self.connections[project_id]
        logger.info("WebSocket disconnected: project=%d, user=%d", project_id, user_id)

    async def broadcast(self, project_id: int, message: dict):
        """向指定项目的所有连接广播消息。"""
        if project_id not in self.connections:
            return
        disconnected: list[int] = []
        for user_id, websocket in self.connections[project_id].items():
            try:
                await websocket.send_json(message)
            except Exception:
                disconnected.append(user_id)
        for uid in disconnected:
            self.disconnect(project_id, uid)

    async def send_to_user(self, project_id: int, user_id: int, message: dict):
        """向指定项目中的指定用户发送消息。"""
        websocket = self.connections.get(project_id, {}).get(user_id)
        if websocket:
            try:
                await websocket.send_json(message)
            except Exception:
                self.disconnect(project_id, user_id)


manager = ConnectionManager()
