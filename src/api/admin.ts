import apiClient from './client';
import type { User } from '@/types/user';
import type { PaginatedData } from '@/types/common';

export async function getUsers(params?: { page?: number; page_size?: number }): Promise<PaginatedData<User>> {
  return apiClient.get('/admin/users', { params });
}

export async function createUser(data: {
  username: string;
  password: string;
  role?: string;
  credits?: number;
}): Promise<User> {
  return apiClient.post('/admin/users', data);
}

export async function updateUserCredits(userId: number, delta: number, reason: string): Promise<void> {
  return apiClient.put(`/admin/users/${userId}/credits`, { delta, reason });
}
