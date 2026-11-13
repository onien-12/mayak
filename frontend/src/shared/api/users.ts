import { api } from './client';
import type {
  Favorites,
  HomeInput,
  PlaceCard,
  ReputationEvent,
  RouteCard,
  Subscription,
  SubscriptionInput,
  UserBrief,
  UserMe,
  UserProfile,
  UserUpdate,
} from './types';

export const usersApi = {
  top: (limit = 10) => api.get<UserBrief[]>('/users/top', { limit }),
  profile: (id: number) => api.get<UserProfile>(`/users/${id}`),
  updateMe: (input: UserUpdate) => api.patch<UserMe>('/users/me', input),
  /** 429 `home_cooldown` while `home.can_change_at` is in the future. */
  setHome: (input: HomeInput) => api.put<UserMe>('/users/me/home', input),
  removeHome: () => api.delete<UserMe>('/users/me/home'),
  places: (id: number, limit = 50) => api.get<PlaceCard[]>(`/users/${id}/places`, { limit }),
  routes: (id: number) => api.get<RouteCard[]>(`/users/${id}/routes`),
  respect: (id: number) => api.post<UserProfile>(`/users/${id}/respect`),

  reputation: (limit = 50) => api.get<ReputationEvent[]>('/me/reputation', { limit }),
  favorites: () => api.get<Favorites>('/me/favorites'),
  myEvents: () => api.get<PlaceCard[]>('/me/events'),
  subscriptions: () => api.get<Subscription[]>('/me/subscriptions'),
  createSubscription: (input: SubscriptionInput) =>
    api.post<Subscription>('/me/subscriptions', input),
  deleteSubscription: (id: number) => api.delete(`/me/subscriptions/${id}`),
};
