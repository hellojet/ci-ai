export interface CharacterView {
  id: number;
  character_id: number;
  image_url: string;
  view_type?: 'front' | 'side' | 'back' | 'expression' | 'action';
  sort_order: number;
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
}
