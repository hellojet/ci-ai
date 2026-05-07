export type EnvironmentImageStatus = 'queued' | 'generating' | 'completed' | 'failed';

export interface EnvironmentImage {
  id: number;
  environment_id: number;
  /** 生成中的占位图可能为空串 */
  image_url: string;
  /** 视角/角度文案（如 wide / close-up / overhead） */
  view_type?: string | null;
  sort_order: number;
  status: EnvironmentImageStatus;
  error_message?: string | null;
  /** 本次生成是否参考了场景的种子图 */
  use_seed_image: boolean;
  /** 本次生成使用的图像模型 id（AI_IMAGE_MODELS 中某一项） */
  model_key?: string | null;
  created_at: string;
}

export interface Environment {
  id: number;
  name: string;
  description?: string;
  base_image_url?: string;
  prompt?: string;
  /** 种子图：生成参考图时可作为 reference_image 传给模型 */
  seed_image_url?: string;
  images: EnvironmentImage[];
  creator_id: number;
  created_at: string;
  updated_at: string;
}

export interface CreateEnvironmentRequest {
  name: string;
  description?: string;
  prompt?: string;
}

export interface GenerateEnvironmentImagesRequest {
  count: number;
  view_types: string[];
  /** 是否参考场景的种子图（默认 false） */
  use_seed_image?: boolean;
  /** 图像模型 id（AI_IMAGE_MODELS 中某一项 id）；不传走默认模型 */
  model_id?: string;
}
