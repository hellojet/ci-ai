export type TaskType = 'image' | 'video' | 'audio';
// 必须与后端 app/tasks/generation_tasks.py 写入的状态一致：
// pending（已入队未开始） → processing（执行中） → completed（成功） | failed（失败）
// cancelled 为保留扩展项
export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

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
