export type CharacterViewStatus = 'queued' | 'generating' | 'completed' | 'failed';

export interface CharacterView {
  id: number;
  character_id: number;
  /** 生成中的占位视图可能为空串 */
  image_url: string | null;
  view_type?: 'front' | 'side' | 'back' | 'expression' | 'action' | null;
  sort_order: number;
  status: CharacterViewStatus;
  error_message?: string | null;
  /** 本次生成是否参考了角色的种子图 */
  use_seed_image: boolean;
  created_at: string;
}

export interface Character {
  id: number;
  name: string;
  description?: string;
  visual_prompt?: string;
  seed_image_url?: string;
  voice_config?: Record<string, unknown>;
  views?: CharacterView[];
  creator_id: number;
  created_at: string;
  updated_at: string;
}

export interface CreateCharacterRequest {
  name: string;
  description?: string;
  visual_prompt?: string;
  voice_config?: Record<string, unknown>;
}

export interface GenerateViewsRequest {
  count: number;
  view_types: string[];
  /** 是否参考角色的种子图（默认 false） */
  use_seed_image?: boolean;
}
