import axios from 'axios';
import { getToken, removeToken } from '@/utils/token';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  timeout: 180000,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

apiClient.interceptors.response.use(
  (response) => {
    const apiResponse = response.data;
    if (apiResponse.code !== undefined && apiResponse.code !== 0) {
      return Promise.reject(new ApiError(apiResponse.message || 'Request failed', response.status));
    }
    return apiResponse.data !== undefined ? apiResponse.data : apiResponse;
  },
  (error) => {
    const status = error.response?.status ?? 0;
    if (status === 401) {
      removeToken();
      // 落地页等公开路由不要被 401 强制跳转走
      if (!['/', '/login'].includes(window.location.pathname)) {
        window.location.href = '/login';
      }
    }
    const message =
      error.response?.data?.message ||
      error.response?.data?.detail ||
      error.message ||
      'Network error';
    return Promise.reject(new ApiError(typeof message === 'string' ? message : 'Request failed', status));
  }
);

export default apiClient;
