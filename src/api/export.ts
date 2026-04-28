import apiClient from './client';

export async function exportProject(projectId: number): Promise<{ download_url: string; expires_at: string }> {
  return apiClient.post(`/projects/${projectId}/export`);
}
