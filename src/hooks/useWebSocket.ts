import { useEffect, useRef, useCallback } from 'react';
import { getToken } from '@/utils/token';
import { useProjectStore } from '@/stores/projectStore';
import { useGenerationStore } from '@/stores/generationStore';
import { message } from 'antd';
import type { WebSocketMessage } from '@/types/websocket';

const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL || `ws://${window.location.host}/api/v1`;

export function useWebSocket(projectId: number | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const reconnectAttempts = useRef(0);
  const maxReconnectDelay = 30000;

  const { onTaskProgress, onTaskCompleted, fetchProject } = useProjectStore();
  const { updateTaskStatus } = useGenerationStore();

  const connect = useCallback(() => {
    if (!projectId) return;

    const token = getToken();
    if (!token) return;

    const wsUrl = `${WS_BASE_URL}/ws/projects/${projectId}?token=${token}`;

    try {
      const websocket = new WebSocket(wsUrl);
      wsRef.current = websocket;

      websocket.onopen = () => {
        reconnectAttempts.current = 0;
      };

      websocket.onmessage = (event) => {
        try {
          const wsMessage: WebSocketMessage = JSON.parse(event.data);

          switch (wsMessage.type) {
            case 'task_progress':
              onTaskProgress(wsMessage.data);
              updateTaskStatus(wsMessage.data.task_id, wsMessage.data.shot_id, wsMessage.data.status, wsMessage.data.progress);
              break;

            case 'task_completed':
              onTaskCompleted(wsMessage.data);
              break;

            case 'task_failed':
              if (!wsMessage.data.will_retry) {
                message.error(`Generation failed: ${wsMessage.data.error_message}`);
              }
              break;

            case 'content_changed':
              if (projectId) {
                fetchProject(projectId);
              }
              break;
          }
        } catch {
          // ignore parse errors
        }
      };

      websocket.onclose = () => {
        wsRef.current = null;
        scheduleReconnect();
      };

      websocket.onerror = () => {
        websocket.close();
      };
    } catch {
      scheduleReconnect();
    }
  }, [projectId, onTaskProgress, onTaskCompleted, fetchProject, updateTaskStatus]);

  const scheduleReconnect = useCallback(() => {
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), maxReconnectDelay);
    reconnectAttempts.current += 1;
    reconnectTimerRef.current = setTimeout(connect, delay);
  }, [connect]);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  useEffect(() => {
    connect();
    return disconnect;
  }, [projectId, connect, disconnect]);

  return { disconnect };
}
