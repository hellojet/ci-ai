import apiClient from './client';
import type { Scene, CreateSceneRequest, UpdateSceneRequest, SceneOrder } from '@/types/scene';

export async function createScene(projectId: number, data: CreateSceneRequest): Promise<Scene> {
  return apiClient.post(`/projects/${projectId}/scenes`, data);
}

export async function updateScene(projectId: number, sceneId: number, data: UpdateSceneRequest): Promise<Scene> {
  return apiClient.put(`/projects/${projectId}/scenes/${sceneId}`, data);
}

export async function deleteScene(projectId: number, sceneId: number): Promise<void> {
  return apiClient.delete(`/projects/${projectId}/scenes/${sceneId}`);
}

export async function reorderScenes(projectId: number, sceneOrders: SceneOrder[]): Promise<void> {
  return apiClient.put(`/projects/${projectId}/scenes/reorder`, { scene_orders: sceneOrders });
}
