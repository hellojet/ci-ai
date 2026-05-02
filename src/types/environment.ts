export interface EnvironmentImage {
  id: number;
  environment_id: number;
  image_url: string;
  sort_order: number;
  created_at: string;
}

export interface Environment {
  id: number;
  name: string;
  description?: string;
  base_image_url?: string;
  prompt?: string;
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
