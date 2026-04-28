export interface Style {
  id: number;
  name: string;
  prompt: string;
  reference_image_url?: string;
  creator_id: number;
  created_at: string;
  updated_at: string;
}

export interface CreateStyleRequest {
  name: string;
  prompt: string;
}
