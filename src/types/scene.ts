import type { Environment } from './environment';
import type { Shot } from './shot';

export interface Scene {
  id: number;
  project_id: number;
  environment_id?: number;
  environment?: Environment;
  title?: string;
  description_prompt?: string;
  sort_order: number;
  shots: Shot[];
  created_at: string;
  updated_at: string;
}

export interface CreateSceneRequest {
  title: string;
  description_prompt?: string;
  environment_id?: number;
  sort_order?: number;
}

export interface UpdateSceneRequest {
  title?: string;
  description_prompt?: string;
  environment_id?: number;
}

export interface SceneOrder {
  scene_id: number;
  sort_order: number;
}
