import { api } from './client';
import type { ComplaintInput } from './types';

export const complaintsApi = {
  create: (input: ComplaintInput) => api.post<{ id: number }>('/complaints', input),
};
