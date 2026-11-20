import api from './api';
import type { SQLGenerateResponse, SQLValidationResult } from '../types';

export interface GenerateSqlPayload {
  schema_id: string;
  database_dialect?: string;
  include_database_creation?: boolean;
  include_drop_tables?: boolean;
  include_indexes?: boolean;
}

export interface ValidateSqlPayload {
  sql_content: string;
  database_dialect?: string;
}

export const sqlService = {
  async generate(payload: GenerateSqlPayload): Promise<SQLGenerateResponse> {
    const { data } = await api.post<SQLGenerateResponse>('/api/sql/generate', payload);
    return data;
  },

  async validate(payload: ValidateSqlPayload): Promise<SQLValidationResult> {
    const { data } = await api.post<SQLValidationResult>('/api/sql/validate', payload);
    return data;
  },

  async getBySchema(schemaId: string, dialect?: string): Promise<SQLGenerateResponse> {
    const params = dialect ? { database_dialect: dialect } : {};
    const { data } = await api.get<SQLGenerateResponse>(`/api/sql/${schemaId}`, { params });
    return data;
  },
};
