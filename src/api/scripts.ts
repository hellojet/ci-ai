import apiClient from './client';
import type { Script, ScriptGenerateRequest, ParseResult } from '@/types/script';

export async function getScript(projectId: number): Promise<Script> {
  return apiClient.get(`/projects/${projectId}/script`);
}

export async function updateScript(projectId: number, content: string): Promise<Script> {
  return apiClient.put(`/projects/${projectId}/script`, { content });
}

export async function generateScript(projectId: number, data: ScriptGenerateRequest): Promise<{ content: string }> {
  return apiClient.post(`/projects/${projectId}/script/generate`, data);
}

export async function parseScript(projectId: number): Promise<ParseResult> {
  return apiClient.post(`/projects/${projectId}/script/parse`);
}
