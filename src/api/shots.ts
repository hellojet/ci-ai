import apiClient from './client';
import type { Shot, CreateShotRequest, UpdateShotRequest, ShotOrder, PromptPreview } from '@/types/shot';

export async function createShot(projectId: number, sceneId: number, data: CreateShotRequest): Promise<Shot> {
  return apiClient.post(`/projects/${projectId}/scenes/${sceneId}/shots`, data);
}

export async function updateShot(projectId: number, shotId: number, data: UpdateShotRequest): Promise<Shot> {
  return apiClient.put(`/projects/${projectId}/shots/${shotId}`, data);
}

export async function deleteShot(projectId: number, shotId: number): Promise<void> {
  return apiClient.delete(`/projects/${projectId}/shots/${shotId}`);
}

export async function reorderShots(projectId: number, shotOrders: ShotOrder[]): Promise<void> {
  return apiClient.put(`/projects/${projectId}/shots/reorder`, { shot_orders: shotOrders });
}

export async function getShotPrompt(projectId: number, shotId: number): Promise<PromptPreview> {
  return apiClient.get(`/projects/${projectId}/shots/${shotId}/prompt`);
}

export async function lockImage(projectId: number, shotId: number, imageId: number): Promise<void> {
  return apiClient.post(`/projects/${projectId}/shots/${shotId}/lock-image`, { image_id: imageId });
}

export async function lockVideo(projectId: number, shotId: number, videoId: number): Promise<void> {
  return apiClient.post(`/projects/${projectId}/shots/${shotId}/lock-video`, { video_id: videoId });
}

export async function uploadAudio(projectId: number, shotId: number, file: File): Promise<{ audio_url: string }> {
  const formData = new FormData();
  formData.append('file', file);
  return apiClient.post(`/projects/${projectId}/shots/${shotId}/upload-audio`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}
