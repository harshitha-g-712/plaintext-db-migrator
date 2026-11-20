import api from './api';
import type {
  WorkflowRunRequest,
  WorkflowApproveRequest,
  WorkflowStatusResponse,
} from '../types';

export const agentService = {
  runWorkflow: async (payload: WorkflowRunRequest): Promise<WorkflowStatusResponse> => {
    const response = await api.post<WorkflowStatusResponse>('/api/agents/run-workflow', payload);
    return response.data;
  },

  getStatus: async (executionId: string): Promise<WorkflowStatusResponse> => {
    const response = await api.get<WorkflowStatusResponse>(`/api/agents/workflow-status/${executionId}`);
    return response.data;
  },

  approveWorkflow: async (
    executionId: string,
    payload: WorkflowApproveRequest
  ): Promise<WorkflowStatusResponse> => {
    const response = await api.post<WorkflowStatusResponse>(
      `/api/agents/workflow-approve/${executionId}`,
      payload
    );
    return response.data;
  },

  getProjectWorkflows: async (projectId: string): Promise<WorkflowStatusResponse[]> => {
    const response = await api.get<WorkflowStatusResponse[]>(`/api/agents/project/${projectId}/workflows`);
    return response.data;
  },
};
