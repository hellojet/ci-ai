import { Tag } from 'antd';
import { SHOT_STATUS_MAP, TASK_STATUS_MAP } from '@/utils/constants';

interface StatusBadgeProps {
  status: string;
  type?: 'shot' | 'task';
}

export default function StatusBadge({ status, type = 'shot' }: StatusBadgeProps) {
  const statusMap = type === 'shot' ? SHOT_STATUS_MAP : TASK_STATUS_MAP;
  const config = statusMap[status] || { label: status, color: '#666' };

  return <Tag color={config.color}>{config.label}</Tag>;
}
