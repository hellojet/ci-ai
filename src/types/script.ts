export interface Script {
  id: number;
  project_id: number;
  content?: string;
  parsed: boolean;
  created_at: string;
  updated_at: string;
}

export interface ScriptGenerateRequest {
  prompt: string;
  mode: 'generate' | 'expand' | 'rewrite';
}

export interface ParsedScene {
  title: string;
  description_prompt: string;
  matched_environment_id?: number;
  environment_matched: boolean;
  shots: ParsedShot[];
}

export interface ParsedShot {
  title: string;
  narration: string;
  dialogue: string;
  action_description: string;
  camera_angle: string;
  matched_characters: { character_id: number; name: string; matched: boolean }[];
  unmatched_characters: string[];
}

export interface ParseResult {
  scenes: ParsedScene[];
  warnings: string[];
}
