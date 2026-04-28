import apiClient from './client';
import type { LoginRequest, RegisterRequest, LoginResponse, User } from '@/types/user';

export async function login(data: LoginRequest): Promise<LoginResponse> {
  return apiClient.post('/auth/login', data);
}

export async function register(data: RegisterRequest): Promise<User> {
  return apiClient.post('/auth/register', data);
}

export async function getMe(): Promise<User> {
  return apiClient.get('/auth/me');
}
