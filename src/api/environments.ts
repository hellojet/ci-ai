import apiClient from './client';
import type { Environment } from '@/types/environment';
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

export async function generateEnvironmentImage(environmentId: number): Promise<void> {
  return apiClient.post(`/environments/${environmentId}/generate-image`);
}

export async function deleteEnvironmentImage(
  environmentId: number,
  imageId: number,
): Promise<void> {
  return apiClient.delete(`/environments/${environmentId}/images/${imageId}`);
}
