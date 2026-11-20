import api from './api';
import type { Project } from '../types';

export interface CreateProjectPayload {
  project_name: string;
  description?: string;
}

export const projectService = {
  async list(): Promise<Project[]> {
    const { data } = await api.get<Project[]>('/api/projects/');
    return data;
  },

  async create(payload: CreateProjectPayload): Promise<Project> {
    const { data } = await api.post<Project>('/api/projects/', payload);
    return data;
  },

  async get(id: string): Promise<Project> {
    const { data } = await api.get<Project>(`/api/projects/${id}`);
    return data;
  },

  async update(id: string, payload: Partial<CreateProjectPayload>): Promise<Project> {
    const { data } = await api.put<Project>(`/api/projects/${id}`, payload);
    return data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/api/projects/${id}`);
  },
};
