import type { Character } from './character';

export type CameraAngle = 'closeup' | 'wide' | 'medium' | 'aerial' | 'pan' | 'tilt' | 'tracking' | 'low_angle';

export type ShotStatus = 'pending' | 'images_generated' | 'image_locked' | 'video_generated' | 'completed';

export interface ShotImage {
  id: number;
  shot_id: number;
  image_url: string;
  is_locked: boolean;
  created_at: string;
}

export interface Shot {
  id: number;
  scene_id: number;
  title?: string;
  narration?: string;
  dialogue?: string;
  subtitle?: string;
  action_description?: string;
  camera_angle?: CameraAngle;
  generated_prompt?: string;
  locked_image_id?: number;
  video_url?: string;
  audio_url?: string;
  sort_order: number;
  status: ShotStatus;
  characters: Character[];
  images: ShotImage[];
  created_at: string;
  updated_at: string;
}

export interface CreateShotRequest {
  title?: string;
  narration?: string;
  dialogue?: string;
  subtitle?: string;
  action_description?: string;
  camera_angle?: CameraAngle;
  character_ids?: number[];
  sort_order?: number;
}

export interface UpdateShotRequest {
  title?: string;
  narration?: string;
  dialogue?: string;
  subtitle?: string;
  action_description?: string;
  camera_angle?: CameraAngle;
  character_ids?: number[];
}

export interface ShotOrder {
  shot_id: number;
  scene_id: number;
  sort_order: number;
}

export interface PromptPreview {
  prompt: string;
  components: {
    style: string;
    environment: string;
    characters: string;
    camera: string;
    action: string;
  };
}
