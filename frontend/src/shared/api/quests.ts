import { api } from './client';
import type {
  QuestCard,
  QuestCheckInput,
  QuestCheckResult,
  QuestDetail,
  QuestEditor,
  QuestInput,
  QuestResult,
  QuestRun,
  QuestRunStartInput,
  QuestsQuery,
} from './questTypes';
import type { Review, ReviewInput } from './types';

export const questsApi = {
  /** Public quests: cards only, never anything about a stage. */
  list: (query: QuestsQuery = {}, signal?: AbortSignal) =>
    api.get<QuestCard[]>('/quests', { ...query }, signal),
  mine: () => api.get<QuestCard[]>('/me/quests'),
  get: (id: number) => api.get<QuestDetail>(`/quests/${id}`),
  /** Everything about every stage: the author and moderators only. */
  editor: (id: number) => api.get<QuestEditor>(`/quests/${id}/edit`),
  create: (input: QuestInput) => api.post<QuestEditor>('/quests', input),
  update: (id: number, input: Partial<QuestInput>) =>
    api.patch<QuestEditor>(`/quests/${id}`, input),
  remove: (id: number) => api.delete(`/quests/${id}`),
  results: (id: number) => api.get<QuestResult[]>(`/quests/${id}/results`),
  reviews: (id: number) => api.get<Review[]>(`/quests/${id}/reviews`),
  saveReview: (id: number, input: ReviewInput) => api.post<Review>(`/quests/${id}/reviews`, input),
  start: (id: number, input: QuestRunStartInput) => api.post<QuestRun>(`/quests/${id}/runs`, input),
  join: (code: string) => api.post<QuestRun>('/quest-runs/join', { code }),
  run: (runId: number) => api.get<QuestRun>(`/quest-runs/${runId}`),
  check: (runId: number, input: QuestCheckInput) =>
    api.post<QuestCheckResult>(`/quest-runs/${runId}/check`, input),
  hint: (runId: number, stage: number) =>
    api.post<QuestRun>(`/quest-runs/${runId}/hint`, { stage }),
  lead: (runId: number, userId: number) =>
    api.post<QuestRun>(`/quest-runs/${runId}/lead`, { user_id: userId }),
  leave: (runId: number) => api.post<void>(`/quest-runs/${runId}/leave`),
  abandon: (runId: number) => api.post<void>(`/quest-runs/${runId}/abandon`),
};
