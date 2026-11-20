import api from './api';
import type { UserRole } from '../types';

export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  projects_count: number;
}

export const userService = {
  async list(): Promise<ManagedUser[]> {
    const { data } = await api.get<ManagedUser[]>('/api/auth/users');
    return data;
  },

  async updateRole(userId: string, role: UserRole): Promise<ManagedUser> {
    const { data } = await api.patch<ManagedUser>(`/api/auth/users/${userId}/role`, { role });
    return data;
  },

  async updateStatus(userId: string, isActive: boolean): Promise<ManagedUser> {
    const { data } = await api.patch<ManagedUser>(`/api/auth/users/${userId}/status`, {
      is_active: isActive,
    });
    return data;
  },

  async delete(userId: string): Promise<void> {
    await api.delete(`/api/auth/users/${userId}`);
  },
};
