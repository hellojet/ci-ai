import apiClient from './client';
import type { PaginatedData } from '@/types/common';

export type TrialStatus = 'pending' | 'contacted' | 'approved' | 'rejected';

export interface TrialRequestPayload {
  name: string;
  email: string;
  company?: string;
  use_case?: string;
  /** honeypot — should remain empty */
  website?: string;
}

export interface TrialRequestRecord {
  id: number;
  name: string;
  email: string;
  company: string | null;
  use_case: string | null;
  ip: string | null;
  user_agent: string | null;
  status: TrialStatus;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TrialRequestUpdatePayload {
  status?: TrialStatus;
  admin_notes?: string | null;
}

export const trialRequestsApi = {
  submit: (payload: TrialRequestPayload): Promise<TrialRequestRecord | null> =>
    apiClient.post('/trial-requests', payload),

  list: (params: {
    page?: number;
    page_size?: number;
    status?: TrialStatus;
    keyword?: string;
  }): Promise<PaginatedData<TrialRequestRecord>> =>
    apiClient.get('/admin/trial-requests', { params }),

  update: (id: number, payload: TrialRequestUpdatePayload): Promise<TrialRequestRecord> =>
    apiClient.put(`/admin/trial-requests/${id}`, payload),

  delete: (id: number): Promise<void> => apiClient.delete(`/admin/trial-requests/${id}`),
};
