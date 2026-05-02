export interface TaskProgressEvent {
  task_id: number;
  shot_id: number;
  task_type: 'image' | 'video' | 'audio';
  status: string;
  progress: number;
}

export interface TaskCompletedEvent {
  task_id: number;
  shot_id: number;
  task_type: 'image' | 'video' | 'audio';
  result_urls: string[];
}

export interface TaskFailedEvent {
  task_id: number;
  shot_id: number;
  error_message: string;
  retry_count: number;
  will_retry: boolean;
}

export interface ContentChangedEvent {
  changed_by: { id: number; username: string };
  entity: string;
  entity_id: number;
  action: string;
}

export type WebSocketMessage =
  | { type: 'task_progress'; data: TaskProgressEvent }
  | { type: 'task_completed'; data: TaskCompletedEvent }
  | { type: 'task_failed'; data: TaskFailedEvent }
  | { type: 'content_changed'; data: ContentChangedEvent };
