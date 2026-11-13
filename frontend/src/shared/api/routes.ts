import { api } from './client';
import type {
  Review,
  ReviewInput,
  RouteCard,
  RouteDetail,
  RouteInput,
  RoutePreview,
  RoutePreviewInput,
  RoutesQuery,
} from './types';

export const routesApi = {
  /** Public routes (`published` / `needs_review`). */
  list: (query: RoutesQuery = {}, signal?: AbortSignal) =>
    api.get<RouteCard[]>('/routes', { ...query }, signal),
  /** All own routes: private, public, pending, hidden — newest first. */
  mine: () => api.get<RouteCard[]>('/me/routes'),
  /** Backend-side 2GIS routing — the only way the frontend ever builds a path. */
  preview: (input: RoutePreviewInput) => api.post<RoutePreview>('/routes/preview', input),
  get: (id: number) => api.get<RouteDetail>(`/routes/${id}`),
  create: (input: RouteInput) => api.post<RouteDetail>('/routes', input),
  update: (id: number, input: Partial<RouteInput>) =>
    api.patch<RouteDetail>(`/routes/${id}`, input),
  remove: (id: number) => api.delete(`/routes/${id}`),
  /** GPX file (waypoints + track) — fetched with auth so private routes export too. */
  gpx: (id: number) => api.blob(`/routes/${id}/gpx`),
  save: (id: number) => api.put<void>(`/routes/${id}/save`),
  unsave: (id: number) => api.delete(`/routes/${id}/save`),
  reviews: (id: number) => api.get<Review[]>(`/routes/${id}/reviews`),
  saveReview: (id: number, input: ReviewInput) => api.post<Review>(`/routes/${id}/reviews`, input),
};
