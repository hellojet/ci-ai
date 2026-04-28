import { create } from 'zustand';
import type { User } from '@/types/user';
import * as authApi from '@/api/auth';
import { setToken, removeToken, getToken } from '@/utils/token';

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
  fetchMe: () => Promise<void>;
  updateCredits: (credits: number) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: getToken(),
  loading: false,

  login: async (username, password) => {
    set({ loading: true });
    try {
      const response = await authApi.login({ username, password });
      setToken(response.access_token);
      set({ user: response.user, token: response.access_token, loading: false });
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  register: async (username, password) => {
    set({ loading: true });
    try {
      await authApi.register({ username, password });
      set({ loading: false });
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  logout: () => {
    removeToken();
    set({ user: null, token: null });
  },

  fetchMe: async () => {
    try {
      const user = await authApi.getMe();
      set({ user });
    } catch {
      removeToken();
      set({ user: null, token: null });
    }
  },

  updateCredits: (credits) => {
    set((state) => {
      if (!state.user) return state;
      return { user: { ...state.user, credits } };
    });
  },
}));
