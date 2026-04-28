import apiClient from './client';
import type { Project, ProjectDetail, CreateProjectRequest, UpdateProjectRequest, LockInfo } from '@/types/project';
import type { PaginatedData } from '@/types/common';

export async function getProjects(params?: { page?: number; page_size?: number; status?: string }): Promise<PaginatedData<Project>> {
  return apiClient.get('/projects', { params });
}

export async function getProject(projectId: number): Promise<ProjectDetail> {
  return apiClient.get(`/projects/${projectId}`);
}

export async function createProject(data: CreateProjectRequest): Promise<Project> {
  return apiClient.post('/projects', data);
}

export async function updateProject(projectId: number, data: UpdateProjectRequest): Promise<Project> {
  return apiClient.put(`/projects/${projectId}`, data);
}

export async function deleteProject(projectId: number): Promise<void> {
  return apiClient.delete(`/projects/${projectId}`);
}

export async function acquireLock(projectId: number): Promise<LockInfo> {
  return apiClient.post(`/projects/${projectId}/lock`);
}

export async function heartbeatLock(projectId: number): Promise<void> {
  return apiClient.post(`/projects/${projectId}/lock/heartbeat`);
}

export async function releaseLock(projectId: number): Promise<void> {
  return apiClient.delete(`/projects/${projectId}/lock`);
}
