import { Button, Tag, Space, message } from 'antd';
import { LockOutlined, UnlockOutlined, EditOutlined } from '@ant-design/icons';
import { useProjectStore } from '@/stores/projectStore';
import { useAuthStore } from '@/stores/authStore';
import CreditsDisplay from '@/components/CreditsDisplay';
import * as projectApi from '@/api/projects';

interface LockBarProps {
  projectId: number;
  onLockAcquired: () => void;
  onLockReleased: () => void;
}

export default function LockBar({ projectId, onLockAcquired, onLockReleased }: LockBarProps) {
  const { isEditing, lockedBy, setEditing, setLockedBy } = useProjectStore();
  const user = useAuthStore((state) => state.user);
  const isMyLock = lockedBy?.id === user?.id;
  const isAdmin = user?.role === 'admin';

  const handleAcquireLock = async () => {
    try {
      const lockInfo = await projectApi.acquireLock(projectId);
      setLockedBy(lockInfo.locked_by);
      setEditing(true);
      onLockAcquired();
      message.success('Edit mode activated');
    } catch (error) {
      message.error((error as Error).message || 'Failed to acquire lock');
    }
  };

  const handleReleaseLock = async () => {
    try {
      await projectApi.releaseLock(projectId);
      setLockedBy(null);
      setEditing(false);
      onLockReleased();
      message.info('Edit mode deactivated');
    } catch (error) {
      message.error((error as Error).message || 'Failed to release lock');
    }
  };

  const handleForceRelease = async () => {
    try {
      await projectApi.releaseLock(projectId);
      setLockedBy(null);
      setEditing(false);
      message.success('Lock force released');
    } catch (error) {
      message.error((error as Error).message || 'Failed to force release lock');
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 16px',
        background: '#141414',
        borderBottom: '1px solid #1e1e1e',
        minHeight: 44,
      }}
    >
      <Space size="middle">
        {!lockedBy && (
          <Button type="primary" icon={<EditOutlined />} size="small" onClick={handleAcquireLock}>
            Enter Edit Mode
          </Button>
        )}

        {lockedBy && isMyLock && (
          <>
            <Tag icon={<UnlockOutlined />} color="green">
              Editing
            </Tag>
            <Button size="small" onClick={handleReleaseLock}>
              Exit Edit Mode
            </Button>
          </>
        )}

        {lockedBy && !isMyLock && (
          <>
            <Tag icon={<LockOutlined />} color="orange">
              {lockedBy.username} is editing
            </Tag>
            {isAdmin && (
              <Button size="small" danger onClick={handleForceRelease}>
                Force Release
              </Button>
            )}
          </>
        )}
      </Space>

      <CreditsDisplay />
    </div>
  );
}
