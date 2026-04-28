import apiClient from './client';
import type { Style } from '@/types/style';
import type { PaginatedData } from '@/types/common';

export async function getStyles(params?: { page?: number; page_size?: number }): Promise<PaginatedData<Style>> {
  return apiClient.get('/styles', { params });
}

export async function getStyle(styleId: number): Promise<Style> {
  return apiClient.get(`/styles/${styleId}`);
}

export async function createStyle(formData: FormData): Promise<Style> {
  return apiClient.post('/styles', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

export async function updateStyle(styleId: number, formData: FormData): Promise<Style> {
  return apiClient.put(`/styles/${styleId}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

export async function deleteStyle(styleId: number): Promise<void> {
  return apiClient.delete(`/styles/${styleId}`);
}

export async function generateStyleImage(styleId: number): Promise<Style> {
  return apiClient.post(`/styles/${styleId}/generate-image`);
}
