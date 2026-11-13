import { api } from './client';
import type {
  LostItem,
  LostItemCard,
  LostItemInput,
  LostMatch,
  LostQuery,
  LostResponse,
  LostSearchQuery,
} from './lostTypes';

export const lostApi = {
  list: (query: LostQuery, signal?: AbortSignal) =>
    api.get<LostItemCard[]>('/lost', { ...query }, signal),
  mine: () => api.get<LostItemCard[]>('/lost/mine'),
  /** «Что потеряли, где, когда» over found posts — no account needed. */
  search: (query: LostSearchQuery, signal?: AbortSignal) =>
    api.get<LostMatch[]>('/lost/search', { ...query }, signal),
  get: (id: number) => api.get<LostItem>(`/lost/${id}`),
  matches: (id: number) => api.get<LostMatch[]>(`/lost/${id}/matches`),
  create: (input: LostItemInput) => api.post<LostItem>('/lost', input),
  close: (id: number) => api.post<LostItem>(`/lost/${id}/close`),
  remove: (id: number) => api.delete(`/lost/${id}`),
  report: (id: number) => api.post<void>(`/lost/${id}/report`),
  hide: (id: number) => api.post<LostItem>(`/lost/${id}/hide`),
  unhide: (id: number) => api.post<LostItem>(`/lost/${id}/unhide`),
  responses: (id: number) => api.get<LostResponse[]>(`/lost/${id}/responses`),
  respond: (id: number, input: { message: string; contact: string }) =>
    api.post<LostResponse>(`/lost/${id}/responses`, input),
  accept: (responseId: number, contact: string) =>
    api.post<LostResponse>(`/lost/responses/${responseId}/accept`, { contact }),
  decline: (responseId: number) => api.post<LostResponse>(`/lost/responses/${responseId}/decline`),
};
