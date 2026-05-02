export const CAMERA_ANGLES = [
  { value: 'closeup', label: '特写' },
  { value: 'wide', label: '广角' },
  { value: 'medium', label: '中景' },
  { value: 'aerial', label: '俯视' },
  { value: 'pan', label: '平移' },
  { value: 'tilt', label: '俯仰' },
  { value: 'tracking', label: '跟随' },
  { value: 'low_angle', label: '低角度' },
] as const;

// 注意：label 是 i18n key，StatusBadge 会通过 useLocale().t(label) 翻译
export const SHOT_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: 'status.shot.pending', color: '#666' },
  images_generated: { label: 'status.shot.images_generated', color: '#1890ff' },
  image_locked: { label: 'status.shot.image_locked', color: '#52c41a' },
  video_generated: { label: 'status.shot.video_generated', color: '#722ed1' },
  completed: { label: 'status.shot.completed', color: '#faad14' },
};

// 注意：key 必须与后端 app/tasks/generation_tasks.py 写入的状态一致
export const TASK_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: 'status.task.pending', color: '#faad14' },
  processing: { label: 'status.task.processing', color: '#1890ff' },
  completed: { label: 'status.task.completed', color: '#52c41a' },
  failed: { label: 'status.task.failed', color: '#ff4d4f' },
  cancelled: { label: 'status.task.cancelled', color: '#999' },
};

export const VIEW_TYPES = [
  { value: 'front', label: '正面' },
  { value: 'side', label: '侧面' },
  { value: 'back', label: '背面' },
  { value: 'expression', label: '表情' },
  { value: 'action', label: '动作' },
] as const;

export const MAX_CHARACTER_VIEWS = 20;
export const DEFAULT_SHOTS_PER_IMAGE = 2;
export const IMAGE_CREDITS_COST = 2;
export const VIDEO_CREDITS_COST = 10;
