import { api } from './client';
import type { EventsQuery, PlaceCard, PlaceDetail, UserBrief } from './types';

export const eventsApi = {
  list: (query: EventsQuery = {}, signal?: AbortSignal) =>
    api.get<PlaceCard[]>('/events', { ...query }, signal),
  join: (placeId: number) => api.put<PlaceDetail>(`/places/${placeId}/event/participation`),
  leave: (placeId: number) => api.delete<PlaceDetail>(`/places/${placeId}/event/participation`),
  participants: (placeId: number) => api.get<UserBrief[]>(`/places/${placeId}/event/participants`),
};
