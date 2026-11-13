import { api } from './client';
import type { Collection, CollectionDetail, CollectionInput, CollectionsQuery } from './types';

export const collectionsApi = {
  list: (query: CollectionsQuery = {}) => api.get<Collection[]>('/collections', { ...query }),
  get: (id: number) => api.get<CollectionDetail>(`/collections/${id}`),
  create: (input: CollectionInput) => api.post<Collection>('/collections', input),
  update: (id: number, input: Partial<CollectionInput>) =>
    api.patch<Collection>(`/collections/${id}`, input),
  remove: (id: number) => api.delete(`/collections/${id}`),
  addPlace: (id: number, placeId: number) => api.put<void>(`/collections/${id}/places/${placeId}`),
  removePlace: (id: number, placeId: number) => api.delete(`/collections/${id}/places/${placeId}`),
};
