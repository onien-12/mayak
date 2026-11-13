import { api } from './client';
import type {
  InterestSignal,
  InterestsInput,
  MyInterests,
  Recommendations,
  RecommendationsQuery,
  Topic,
} from './types';

export const interestsApi = {
  /** The fixed catalogue of topics in display order. */
  topics: () => api.get<Topic[]>('/interests/topics'),
  mine: () => api.get<MyInterests>('/me/interests'),
  /** Replaces the chosen set and marks the picker as answered. */
  save: (input: InterestsInput) => api.put<MyInterests>('/me/interests', input),
  /** Forgets everything learned from behaviour. */
  forgetNoticed: () => api.delete<MyInterests>('/me/interests/noticed'),
  signal: (input: InterestSignal) => api.post<void>('/me/interests/signals', input),
  recommendations: (query: RecommendationsQuery, signal?: AbortSignal) =>
    api.get<Recommendations>('/recommendations', { ...query }, signal),
};
