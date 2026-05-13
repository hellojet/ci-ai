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
  /** 任务创建时携带的生成参数（图片/视频的比例、分辨率、时长、水印等） */
  params?: ImageGenParams | VideoGenParams | null;
  created_by: number;
  created_at: string;
  updated_at: string;
}

/** 图片生成参数：与后端 generation_service._sanitize_params 中 image 白名单严格一致 */
export interface ImageGenParams {
  /** 图片比例，如 "9:16" / "16:9" / "1:1" / "4:3" / "3:2" */
  ratio?: string;
  /** 分辨率档位，如 "720p" / "1080p" / "2k" */
  resolution?: string;
}

/** 视频生成参数：与后端 generation_service._sanitize_params 中 video 白名单严格一致 */
export interface VideoGenParams {
  ratio?: string;
  resolution?: string;
  /** 视频时长（秒） */
  duration?: number;
  /** 是否在输出视频上加水印 */
  watermark?: boolean;
  /** 驱动音频 URL（角色声音档案），仅支持音频的模型（如 wan2.7-i2v）会使用 */
  audio_url?: string;
}

export interface GenerateRequest {
  task_type: TaskType;
  /** 图像任务时可选的模型 id；其它任务类型后端会忽略。 */
  model_id?: string;
  /** 生成参数（按任务类型形态不同），缺省由后端走默认值（图片 9:16/1080p；视频 9:16/1080p/5s/无水印） */
  params?: ImageGenParams | VideoGenParams;
}

export interface GenerateResponse {
  task_id: number;
  task_type: TaskType;
  status: TaskStatus;
  credits_cost: number;
  model_key?: string;
}

export interface BatchGenerateResponse {
  tasks: { task_id: number; shot_id: number; status: TaskStatus }[];
  total_credits_cost: number;
}
