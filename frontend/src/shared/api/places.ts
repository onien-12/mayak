import { api } from './client';
import type {
  Comment,
  HistoryEntry,
  IssueOfficialInput,
  PlaceCard,
  PlaceDetail,
  PlaceInput,
  PlacePage,
  PlacesPageQuery,
  PlacesQuery,
  PlaceUpdate,
  Review,
  ReviewInput,
  VoteInput,
} from './types';

export const placesApi = {
  list: (query: PlacesQuery = {}, signal?: AbortSignal) =>
    api.get<PlaceCard[]>('/places', { ...query }, signal),
  page: (query: PlacesPageQuery, signal?: AbortSignal) =>
    api.get<PlacePage>('/places/page', { ...query }, signal),
  get: (id: number) => api.get<PlaceDetail>(`/places/${id}`),
  create: (input: PlaceInput) => api.post<PlaceDetail>('/places', input),
  update: (id: number, input: PlaceUpdate) => api.patch<PlaceDetail>(`/places/${id}`, input),
  remove: (id: number) => api.delete(`/places/${id}`),

  history: (id: number) => api.get<HistoryEntry[]>(`/places/${id}/history`),
  vote: (id: number, input: VoteInput) => api.post<PlaceDetail>(`/places/${id}/votes`, input),
  withdrawVote: (id: number) => api.delete<PlaceDetail>(`/places/${id}/votes`),

  reviews: (id: number) => api.get<Review[]>(`/places/${id}/reviews`),
  saveReview: (id: number, input: ReviewInput) => api.post<Review>(`/places/${id}/reviews`, input),

  comments: (id: number) => api.get<Comment[]>(`/places/${id}/comments`),
  addComment: (id: number, text: string) => api.post<Comment>(`/places/${id}/comments`, { text }),
  deleteComment: (commentId: number) => api.delete(`/comments/${commentId}`),

  addPhotos: (id: number, photoIds: number[]) =>
    api.post<PlaceDetail>(`/places/${id}/photos`, { photo_ids: photoIds }),

  addFavorite: (id: number) => api.put<void>(`/places/${id}/favorite`),
  removeFavorite: (id: number) => api.delete(`/places/${id}/favorite`),

  appeal: (id: number, text: string) =>
    api.post<{ case_id: number }>(`/places/${id}/appeal`, { text }),

  updateIssueOfficial: (id: number, input: IssueOfficialInput) =>
    api.patch<PlaceDetail>(`/places/${id}/issue/official`, input),
};
