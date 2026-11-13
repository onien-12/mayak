import { api } from './client';
import type {
  HeldItem,
  HeldQuery,
  ModerationCase,
  ModerationCaseDetail,
  ModerationLogEntry,
  ModerationQueueQuery,
  ModerationSummary,
  PageParams,
  ResolveCaseInput,
} from './types';

export const moderationApi = {
  queue: (query: ModerationQueueQuery = {}) =>
    api.get<ModerationCase[]>('/moderation/queue', { ...query }),
  summary: () => api.get<ModerationSummary>('/moderation/summary'),
  case: (id: number) => api.get<ModerationCaseDetail>(`/moderation/cases/${id}`),
  resolve: (id: number, input: ResolveCaseInput) =>
    api.post<ModerationCaseDetail>(`/moderation/cases/${id}/resolve`, input),
  log: (page: PageParams = { limit: 50, offset: 0 }) =>
    api.get<ModerationLogEntry[]>('/moderation/log', { ...page }),
  /** Photos, comments, reviews and notes held on their own (SPEC §24.1). */
  held: (query: HeldQuery = {}) => api.get<HeldItem[]>('/moderation/held', { ...query }),
  release: (holdId: number, reason: string) =>
    api.post<void>(`/moderation/held/${holdId}/release`, { reason }),
  remove: (holdId: number, reason: string) =>
    api.post<void>(`/moderation/held/${holdId}/remove`, { reason }),
};
