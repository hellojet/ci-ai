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

export interface ShotVideo {
  id: number;
  shot_id: number;
  video_url: string;
  source_image_id?: number;
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
  locked_video_id?: number;
  /** 场景参考图 id（来自当前分镜所属场景的 environment.images） */
  ref_environment_image_id?: number | null;
  /** 旧字段：单个角色参考图 id，仅用于向下兼容。新逻辑读 ref_character_view_ids */
  ref_character_view_id?: number | null;
  /** 多角色多参考图：每个被选角色可锁一张 view 作为参考图 */
  ref_character_view_ids?: number[] | null;
  /** 图片提示词模块开关：null 表示全开（兼容旧分镜） */
  prompt_modules_image?: PromptModuleSwitches | null;
  /** 视频提示词模块开关：null 表示全开 */
  prompt_modules_video?: PromptModuleSwitches | null;
  /** 用户自定义图片提示词；非空时覆盖开关拼接结果 */
  custom_prompt_image?: string | null;
  /** 用户自定义视频提示词；非空时覆盖开关拼接结果 */
  custom_prompt_video?: string | null;
  video_url?: string;
  audio_url?: string;
  sort_order: number;
  status: ShotStatus;
  characters: Character[];
  images: ShotImage[];
  videos: ShotVideo[];
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
  /** 场景参考图（来自当前分镜所属场景的 environment.images） */
  ref_environment_image_id?: number | null;
  /** 多角色多参考图：每个被选角色各锁一张 view */
  ref_character_view_ids?: number[] | null;
  /** 提示词模块开关 + 自定义提示词（custom_prompt_* 传 "" 视为清空） */
  prompt_modules_image?: PromptModuleSwitches | null;
  prompt_modules_video?: PromptModuleSwitches | null;
  custom_prompt_image?: string | null;
  custom_prompt_video?: string | null;
}

export interface ShotOrder {
  shot_id: number;
  scene_id: number;
  sort_order: number;
}

/** 提示词模块的 6 个开关键。后端 PROMPT_MODULE_KEYS 与此保持一致。 */
export type PromptModuleKey =
  | 'style'
  | 'environment'
  | 'characters'
  | 'action'
  | 'dialogue'
  | 'camera';

export type PromptModuleSwitches = Record<PromptModuleKey, boolean>;

export interface PromptComponents {
  style: string;
  environment: string;
  characters: string;
  action: string;
  dialogue: string;
  camera: string;
}

export interface PromptPreview {
  prompt: string;
  components: PromptComponents;
  /** True 表示当前用的是自定义提示词，开关已失效 */
  is_custom: boolean;
  /** 当前实际生效的开关状态（None 在响应里被展开为完整 dict） */
  modules: PromptModuleSwitches;
}

export type PromptType = 'image' | 'video';

/** 给前端 ShotEditor 用的 6 个模块的展示元数据 */
export const PROMPT_MODULE_META: Array<{ key: PromptModuleKey; label: string; hint?: string }> = [
  { key: 'style', label: '风格' },
  { key: 'environment', label: '场景' },
  { key: 'characters', label: '角色' },
  { key: 'action', label: '动作' },
  { key: 'dialogue', label: '对白' },
  { key: 'camera', label: '镜头角度' },
];

export const DEFAULT_PROMPT_MODULES: PromptModuleSwitches = {
  style: true,
  environment: true,
  characters: true,
  action: true,
  dialogue: true,
  camera: true,
};
