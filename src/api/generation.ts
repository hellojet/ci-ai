import apiClient from './client';
import type { GenerateRequest, GenerateResponse, BatchGenerateResponse, GenerationTask } from '@/types/generation';
import type { ImageModel, ImageModelListResponse } from '@/types/imageModel';
import type { VideoModel, VideoModelListResponse } from '@/types/videoModel';
import type { PaginatedData } from '@/types/common';

export async function getImageModels(): Promise<ImageModel[]> {
  const result = await apiClient.get<ImageModelListResponse>('/image-models');
  return result.items;
}

export async function getVideoModels(): Promise<VideoModel[]> {
  const result = await apiClient.get<VideoModelListResponse>('/video-models');
  return result.items;
}

export async function generateForShot(projectId: number, shotId: number, data: GenerateRequest): Promise<GenerateResponse> {
  return apiClient.post(`/projects/${projectId}/shots/${shotId}/generate`, data);
}

export async function generateAll(projectId: number, data: GenerateRequest): Promise<BatchGenerateResponse> {
  return apiClient.post(`/projects/${projectId}/generate-all`, data);
}

export async function retryTask(projectId: number, taskId: number): Promise<GenerateResponse> {
  return apiClient.post(`/projects/${projectId}/tasks/${taskId}/retry`);
}

export async function getTasks(projectId: number, params?: { status?: string; task_type?: string }): Promise<PaginatedData<GenerationTask>> {
  return apiClient.get(`/projects/${projectId}/tasks`, { params });
}

export async function getShotTasks(projectId: number, shotId: number): Promise<GenerationTask[]> {
  return apiClient.get(`/projects/${projectId}/shots/${shotId}/tasks`);
}
