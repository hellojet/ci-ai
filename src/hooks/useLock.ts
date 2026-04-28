import { useEffect, useRef, useCallback } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import * as projectApi from '@/api/projects';
import { LOCK_HEARTBEAT_INTERVAL } from '@/utils/constants';
import { message } from 'antd';

export function useLock(projectId: number | null) {
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval>>();
  const { setEditing, setLockedBy } = useProjectStore();

  const acquireLock = useCallback(async () => {
    if (!projectId) return false;
    try {
      const lockInfo = await projectApi.acquireLock(projectId);
      setLockedBy(lockInfo.locked_by);
      setEditing(true);
      startHeartbeat();
      return true;
    } catch (error) {
      message.error((error as Error).message || 'Failed to acquire lock');
      return false;
    }
  }, [projectId, setEditing, setLockedBy]);

  const releaseLock = useCallback(async () => {
    if (!projectId) return;
    stopHeartbeat();
    try {
      await projectApi.releaseLock(projectId);
      setLockedBy(null);
      setEditing(false);
    } catch (error) {
      message.error((error as Error).message || 'Failed to release lock');
    }
  }, [projectId, setEditing, setLockedBy]);

  const startHeartbeat = useCallback(() => {
    stopHeartbeat();
    heartbeatTimerRef.current = setInterval(async () => {
      if (projectId) {
        try {
          await projectApi.heartbeatLock(projectId);
        } catch {
          stopHeartbeat();
          setEditing(false);
          message.warning('Lock expired, edit mode deactivated');
        }
      }
    }, LOCK_HEARTBEAT_INTERVAL);
  }, [projectId, setEditing]);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = undefined;
    }
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (projectId) {
        navigator.sendBeacon(`/api/v1/projects/${projectId}/lock`, '');
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      stopHeartbeat();
    };
  }, [projectId, stopHeartbeat]);

  return { acquireLock, releaseLock };
}
