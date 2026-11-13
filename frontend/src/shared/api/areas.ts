import { api } from './client';
import type {
  AreaCard,
  AreaDetail,
  AreaGeometryCandidate,
  AreaGeometryLookupQuery,
  AreaInput,
  AreasQuery,
  AreaUpdate,
} from './types';

export const areasApi = {
  /** Sorted by `interest`, highest first (never by the personal value). */
  list: (query: AreasQuery = {}, signal?: AbortSignal) =>
    api.get<AreaCard[]>('/areas', { ...query }, signal),
  /** `topics`: csv of `TopicSlug` — a visitor's interest profile for `personal_interest`. */
  get: (id: number, topics?: string) => api.get<AreaDetail>(`/areas/${id}`, { topics }),
  create: (input: AreaInput) => api.post<AreaDetail>('/areas', input),
  update: (id: number, input: AreaUpdate) => api.patch<AreaDetail>(`/areas/${id}`, input),
  remove: (id: number) => api.delete(`/areas/${id}`),
  /** Boundary candidates from the tapped 2GIS object or an OpenStreetMap search by name. */
  lookupGeometry: (query: AreaGeometryLookupQuery, signal?: AbortSignal) =>
    api.get<AreaGeometryCandidate[]>('/areas/geometry-lookup', { ...query }, signal),
};
