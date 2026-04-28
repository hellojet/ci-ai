import apiClient from './client';
import type { UploadResult } from '@/types/common';

export async function uploadFile(file: File, category: string): Promise<UploadResult> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('category', category);
  return apiClient.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}
