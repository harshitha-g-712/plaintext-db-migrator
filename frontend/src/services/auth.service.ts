import api from './api';
import type { User } from '../types';

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  role?: 'ADMIN' | 'DEVELOPER';
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export const authService = {
  async register(payload: RegisterPayload): Promise<User> {
    const { data } = await api.post<User>('/api/auth/register', payload);
    return data;
  },

  async login(payload: LoginPayload): Promise<TokenResponse> {
    const { data } = await api.post<TokenResponse>('/api/auth/login', payload);
    return data;
  },

  async getMe(): Promise<User> {
    const { data } = await api.get<User>('/api/auth/me');
    return data;
  },

  logout(): void {
    localStorage.removeItem('access_token');
  },
};
