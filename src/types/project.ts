import type { User } from './user';
import type { Style } from './style';
import type { Scene } from './scene';
import type { Script } from './script';

export interface Project {
  id: number;
  name: string;
  description?: string;
  status: 'draft' | 'in_progress' | 'completed';
  style?: Style;
  style_id?: number;
  shots_per_image: number;
  locked_by?: User | null;
  lock_heartbeat?: string | null;
  creator: User;
  created_at: string;
  updated_at: string;
}

export interface ProjectDetail extends Project {
  script?: Script;
  scenes: Scene[];
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  style_id?: number;
  shots_per_image?: number;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  style_id?: number;
  shots_per_image?: number;
}

export interface LockInfo {
  locked: boolean;
  locked_by: User;
  lock_heartbeat: string;
}
