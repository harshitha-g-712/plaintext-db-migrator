import api from './api';
import type {
  SchemaDiffReport,
  MigrationRecord,
} from '../types';

export interface CompareMigrationPayload {
  project_id: string;
  target_schema_id: string;
  source_schema_id?: string | null;
  database_dialect?: string;
}

export interface GenerateMigrationPayload {
  project_id: string;
  target_schema_id: string;
  source_schema_id?: string | null;
  database_dialect?: string;
}

export interface ExecuteMigrationPayload {
  connection_id?: string;
  force_destructive?: boolean;
}

export const migrationService = {
  async compare(payload: CompareMigrationPayload): Promise<SchemaDiffReport> {
    const { data } = await api.post<SchemaDiffReport>('/api/migrations/compare', payload);
    return data;
  },

  async generate(payload: GenerateMigrationPayload): Promise<MigrationRecord> {
    const { data } = await api.post<MigrationRecord>('/api/migrations/generate', payload);
    return data;
  },

  async listByProject(projectId: string): Promise<MigrationRecord[]> {
    const { data } = await api.get<MigrationRecord[]>(`/api/migrations/project/${projectId}`);
    return data;
  },

  async getById(id: string): Promise<MigrationRecord> {
    const { data } = await api.get<MigrationRecord>(`/api/migrations/${id}`);
    return data;
  },

  async execute(id: string, payload: ExecuteMigrationPayload = {}): Promise<MigrationRecord> {
    const { data } = await api.post<MigrationRecord>(`/api/migrations/${id}/execute`, payload);
    return data;
  },

  async rollback(id: string): Promise<MigrationRecord> {
    const { data } = await api.post<MigrationRecord>(`/api/migrations/${id}/rollback`);
    return data;
  },
};
