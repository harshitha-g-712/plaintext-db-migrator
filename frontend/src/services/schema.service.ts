import api from './api';
import type { SchemaRecord, CompleteSchemaDefinition } from '../types';

export interface GenerateSchemaPayload {
  project_id: string;
  database_dialect?: string;
  custom_instructions?: string;
}

export interface UpdateSchemaPayload {
  schema_name?: string;
  database_dialect?: string;
  schema_definition: CompleteSchemaDefinition;
  mermaid_er?: string;
}

export const schemaService = {
  async generate(payload: GenerateSchemaPayload): Promise<SchemaRecord> {
    const { data } = await api.post<SchemaRecord>('/api/schema/generate', payload);
    return data;
  },

  async getLatestByProject(projectId: string): Promise<SchemaRecord | null> {
    const { data } = await api.get<SchemaRecord | null>(`/api/schema/project/${projectId}`);
    return data;
  },

  async getById(id: string): Promise<SchemaRecord> {
    const { data } = await api.get<SchemaRecord>(`/api/schema/${id}`);
    return data;
  },

  async update(id: string, payload: UpdateSchemaPayload): Promise<SchemaRecord> {
    const { data } = await api.put<SchemaRecord>(`/api/schema/${id}`, payload);
    return data;
  },
};
