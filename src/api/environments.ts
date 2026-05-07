import apiClient from './client';
import type {
  Environment,
  EnvironmentImage,
  GenerateEnvironmentImagesRequest,
} from '@/types/environment';
import type { PaginatedData } from '@/types/common';

export async function getEnvironments(params?: { page?: number; page_size?: number; keyword?: string }): Promise<PaginatedData<Environment>> {
  return apiClient.get('/environments', { params });
}

export async function getEnvironment(environmentId: number): Promise<Environment> {
  return apiClient.get(`/environments/${environmentId}`);
}

export async function createEnvironment(formData: FormData): Promise<Environment> {
  return apiClient.post('/environments', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

export async function updateEnvironment(environmentId: number, formData: FormData): Promise<Environment> {
  return apiClient.put(`/environments/${environmentId}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

export async function deleteEnvironment(environmentId: number): Promise<void> {
  return apiClient.delete(`/environments/${environmentId}`);
}

/**
 * 异步派发场景图生成任务，立即返回占位 image 列表（status=queued）。
 * 前端拿到后渲染 loading 卡片，再轮询 getEnvironment 等 worker 回填。
 */
export async function generateEnvironmentImages(
  environmentId: number,
  data: GenerateEnvironmentImagesRequest,
): Promise<EnvironmentImage[]> {
  return apiClient.post(`/environments/${environmentId}/generate-image`, data);
}

export async function uploadEnvironmentImage(
  environmentId: number,
  params: { image_url?: string; view_type?: string; file?: File },
): Promise<EnvironmentImage> {
  const formData = new FormData();
  if (params.image_url) formData.append('image_url', params.image_url);
  if (params.view_type) formData.append('view_type', params.view_type);
  if (params.file) formData.append('image', params.file);
  return apiClient.post(`/environments/${environmentId}/images`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

export async function deleteEnvironmentImage(
  environmentId: number,
  imageId: number,
): Promise<void> {
  return apiClient.delete(`/environments/${environmentId}/images/${imageId}`);
}
