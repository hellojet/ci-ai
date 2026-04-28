import apiClient from './client';
import type { SystemSetting, UpdateSettingsRequest } from '@/types/settings';

export async function getSettings(): Promise<{ items: SystemSetting[] }> {
  return apiClient.get('/settings');
}

export async function updateSettings(data: UpdateSettingsRequest): Promise<void> {
  return apiClient.put('/settings', data);
}
