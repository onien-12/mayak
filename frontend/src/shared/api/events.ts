import { api } from './client';
import type {
  EventContribution,
  EventJoinInput,
  EventsQuery,
  PlaceCard,
  PlaceDetail,
  UserBrief,
} from './types';

export const eventsApi = {
  list: (query: EventsQuery = {}, signal?: AbortSignal) =>
    api.get<PlaceCard[]>('/events', { ...query }, signal),
  /** A note (swaps only) says what the participant brings; sending one again adds to the list. */
  join: (placeId: number, input?: EventJoinInput) =>
    api.put<PlaceDetail>(`/places/${placeId}/event/participation`, input),
  leave: (placeId: number) => api.delete<PlaceDetail>(`/places/${placeId}/event/participation`),
  participants: (placeId: number) => api.get<UserBrief[]>(`/places/${placeId}/event/participants`),
  contributions: (placeId: number) =>
    api.get<EventContribution[]>(`/places/${placeId}/event/contributions`),
};
