export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
}

export interface PaginatedData<T> {
  total: number;
  items: T[];
}

export interface UploadResult {
  url: string;
  filename: string;
  size: number;
  content_type: string;
}
