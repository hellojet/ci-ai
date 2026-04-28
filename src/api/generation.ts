import apiClient from './client';
import type { GenerateRequest, GenerateResponse, BatchGenerateResponse, GenerationTask } from '@/types/generation';
import type { PaginatedData } from '@/types/common';

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
