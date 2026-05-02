import apiClient from './client';

/**
 * 兼容旧接口：POST /projects/{id}/export 返回一个下载 URL。
 * 当前后端未实现，保留以防未来添加。
 */
export async function exportProject(
  projectId: number,
): Promise<{ download_url: string; expires_at: string }> {
  return apiClient.post(`/projects/${projectId}/export`);
}

/** 导出项目结构化 JSON 数据（对应 TC-6.1）。*/
export async function exportProjectJson(projectId: number): Promise<Record<string, unknown>> {
  return apiClient.get(`/projects/${projectId}/export/json`);
}

/** 下载项目 ZIP 包（对应 TC-6.2）。需要 blob 响应类型。*/
export async function exportProjectZip(projectId: number): Promise<Blob> {
  return apiClient.get(`/projects/${projectId}/export/zip`, {
    responseType: 'blob',
  });
}
