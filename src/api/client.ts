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

apiClient.interceptors.response.use(
  (response) => {
    const apiResponse = response.data;
    if (apiResponse.code !== undefined && apiResponse.code !== 0) {
      return Promise.reject(new Error(apiResponse.message || 'Request failed'));
    }
    return apiResponse.data !== undefined ? apiResponse.data : apiResponse;
  },
  (error) => {
    if (error.response?.status === 401) {
      removeToken();
      window.location.href = '/login';
    }
    const message = error.response?.data?.message || error.message || 'Network error';
    return Promise.reject(new Error(message));
  }
);

export default apiClient;
