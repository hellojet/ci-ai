export type TaskType = 'image' | 'video' | 'audio';
export type TaskStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled';

export interface GenerationTask {
  id: number;
  shot_id: number;
  task_type: TaskType;
  status: TaskStatus;
  retry_count: number;
  credits_cost: number;
  result_url?: string;
  error_message?: string;
  celery_task_id?: string;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface GenerateRequest {
  task_type: TaskType;
}

export interface GenerateResponse {
  task_id: number;
  task_type: TaskType;
  status: TaskStatus;
  credits_cost: number;
}

export interface BatchGenerateResponse {
  tasks: { task_id: number; shot_id: number; status: TaskStatus }[];
  total_credits_cost: number;
}
