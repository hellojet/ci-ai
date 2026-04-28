export interface Environment {
  id: number;
  name: string;
  description?: string;
  base_image_url?: string;
  prompt?: string;
  creator_id: number;
  created_at: string;
  updated_at: string;
}

export interface CreateEnvironmentRequest {
  name: string;
  description?: string;
  prompt?: string;
}
