export const CAMERA_ANGLES = [
  { value: 'closeup', label: 'Close-up' },
  { value: 'wide', label: 'Wide' },
  { value: 'medium', label: 'Medium' },
  { value: 'aerial', label: "Bird's Eye" },
  { value: 'pan', label: 'Pan' },
  { value: 'tilt', label: 'Tilt' },
  { value: 'tracking', label: 'Tracking' },
  { value: 'low_angle', label: 'Low Angle' },
] as const;

export const SHOT_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: '#666' },
  images_generated: { label: 'Images Ready', color: '#1890ff' },
  image_locked: { label: 'Image Locked', color: '#52c41a' },
  video_generated: { label: 'Video Ready', color: '#722ed1' },
  completed: { label: 'Completed', color: '#faad14' },
};

export const TASK_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: 'Waiting', color: '#666' },
  running: { label: 'Running', color: '#1890ff' },
  success: { label: 'Completed', color: '#52c41a' },
  failed: { label: 'Failed', color: '#ff4d4f' },
  cancelled: { label: 'Cancelled', color: '#999' },
};

export const VIEW_TYPES = [
  { value: 'front', label: 'Front' },
  { value: 'side', label: 'Side' },
  { value: 'back', label: 'Back' },
  { value: 'expression', label: 'Expression' },
  { value: 'action', label: 'Action' },
] as const;

export const LOCK_HEARTBEAT_INTERVAL = 30000;
export const MAX_CHARACTER_VIEWS = 20;
export const DEFAULT_SHOTS_PER_IMAGE = 2;
export const IMAGE_CREDITS_COST = 2;
export const VIDEO_CREDITS_COST = 10;
