import apiClient from './client';
import type { Character, GenerateViewsRequest } from '@/types/character';
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

export async function generateViews(characterId: number, data: GenerateViewsRequest): Promise<void> {
  return apiClient.post(`/characters/${characterId}/generate-views`, data);
}

export async function deleteView(characterId: number, viewId: number): Promise<void> {
  return apiClient.delete(`/characters/${characterId}/views/${viewId}`);
}
