import { Tag } from 'antd';
import { SHOT_STATUS_MAP, TASK_STATUS_MAP } from '@/utils/constants';
import { useLocale } from '@/hooks/useLocale';

interface StatusBadgeProps {
  status: string;
  type?: 'shot' | 'task';
}

export default function StatusBadge({ status, type = 'shot' }: StatusBadgeProps) {
  const { t } = useLocale();
  const statusMap = type === 'shot' ? SHOT_STATUS_MAP : TASK_STATUS_MAP;
  const config = statusMap[status] || { label: status, color: '#666' };
  // config.label 是 i18n key；若没命中回退显示原始 status 字符串
  const label = config.label.startsWith('status.') ? t(config.label) : config.label;

  return <Tag color={config.color}>{label}</Tag>;
}
