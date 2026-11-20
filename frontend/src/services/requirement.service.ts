import api from './api';
import type { Requirement, AnalyzedRequirement } from '../types';

export interface AnalyzeRequirementPayload {
  project_id: string;
  requirements_text: string;
}

export interface UpdateRequirementPayload {
  original_text?: string;
  analyzed_data: AnalyzedRequirement;
}

export const requirementService = {
  async analyze(payload: AnalyzeRequirementPayload): Promise<Requirement> {
    const { data } = await api.post<Requirement>('/api/requirements/analyze', payload);
    return data;
  },

  async getByProject(projectId: string): Promise<Requirement | null> {
    const { data } = await api.get<Requirement | null>(`/api/requirements/project/${projectId}`);
    return data;
  },

  async getById(id: string): Promise<Requirement> {
    const { data } = await api.get<Requirement>(`/api/requirements/${id}`);
    return data;
  },

  async update(id: string, payload: UpdateRequirementPayload): Promise<Requirement> {
    const { data } = await api.put<Requirement>(`/api/requirements/${id}`, payload);
    return data;
  },
};
