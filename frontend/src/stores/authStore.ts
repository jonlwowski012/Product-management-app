import { create } from 'zustand';
import type { User } from '../types';
import { api } from '../utils/api';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,

  login: async (email, password) => {
    const user = await api.post<User>('/auth/login', { email, password });
    set({ user });
  },

  register: async (email, name, password) => {
    const user = await api.post<User>('/auth/register', { email, name, password });
    set({ user });
  },

  logout: async () => {
    await api.post('/auth/logout');
    set({ user: null });
  },

  checkAuth: async () => {
    try {
      const user = await api.get<User>('/auth/me');
      set({ user, loading: false });
    } catch {
      set({ user: null, loading: false });
    }
  },
}));
