import apiClient from './client';
import type { Character, CharacterView, GenerateViewsRequest } from '@/types/character';
import type { PaginatedData } from '@/types/common';

export async function getCharacters(params?: { page?: number; page_size?: number; keyword?: string }): Promise<PaginatedData<Character>> {
  return apiClient.get('/characters', { params });
}

export async function getCharacter(characterId: number): Promise<Character> {
  return apiClient.get(`/characters/${characterId}`);
}

export async function createCharacter(formData: FormData): Promise<Character> {
  return apiClient.post('/characters', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

export async function updateCharacter(characterId: number, formData: FormData): Promise<Character> {
  return apiClient.put(`/characters/${characterId}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

export async function deleteCharacter(characterId: number): Promise<void> {
  return apiClient.delete(`/characters/${characterId}`);
}

export async function generateViews(
  characterId: number,
  data: GenerateViewsRequest,
): Promise<CharacterView[]> {
  // 后端已改为异步派发：立即返回占位 view(status=queued) 列表，前端可直接渲染 loading 卡片
  return apiClient.post(`/characters/${characterId}/generate-views`, data);
}

export async function uploadView(
  characterId: number,
  params: { image_url?: string; view_type?: string; file?: File },
): Promise<CharacterView> {
  const formData = new FormData();
  if (params.image_url) formData.append('image_url', params.image_url);
  if (params.view_type) formData.append('view_type', params.view_type);
  if (params.file) formData.append('image', params.file);
  return apiClient.post(`/characters/${characterId}/views`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

export async function deleteView(characterId: number, viewId: number): Promise<void> {
  return apiClient.delete(`/characters/${characterId}/views/${viewId}`);
}
