import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth';
import {
  errorMessage,
  placesApi,
  queryKeys,
  routesApi,
  usersApi,
  type Favorites,
  type PlaceCard,
  type PlaceDetail,
  type RouteCard,
  type RouteDetail,
} from '@/shared/api';
import { toast } from '@/shared/ui';

/** `GET /me/favorites` — favorite places and saved routes of the signed-in user. */
export function useFavorites() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: queryKeys.me.favorites,
    queryFn: usersApi.favorites,
    enabled: isAuthenticated,
  });
}

interface SavedList<T extends { id: number }> {
  select: (favorites: Favorites) => T[];
  replace: (favorites: Favorites, list: T[]) => Favorites;
  add: (id: number) => Promise<void>;
  remove: (id: number) => Promise<void>;
  /** Mirrors the state into an open place card / route page, if it is cached. */
  syncDetail: (queryClient: QueryClient, id: number, saved: boolean) => void;
  removedText: string;
}

const PLACES: SavedList<PlaceCard> = {
  select: (favorites) => favorites.places,
  replace: (favorites, places) => ({ ...favorites, places }),
  add: placesApi.addFavorite,
  remove: placesApi.removeFavorite,
  syncDetail: (queryClient, id, saved) =>
    queryClient.setQueryData<PlaceDetail>(queryKeys.places.detail(id), (place) =>
      place ? { ...place, is_favorite: saved } : place,
    ),
  removedText: 'Место убрано из избранного',
};

const ROUTES: SavedList<RouteCard> = {
  select: (favorites) => favorites.routes,
  replace: (favorites, routes) => ({ ...favorites, routes }),
  add: routesApi.save,
  remove: routesApi.unsave,
  syncDetail: (queryClient, id, saved) =>
    queryClient.setQueryData<RouteDetail>(queryKeys.routes.detail(id), (route) =>
      route ? { ...route, is_saved: saved } : route,
    ),
  removedText: 'Маршрут убран из сохранённых',
};

const insertAt = <T>(list: readonly T[], index: number, item: T): T[] => [
  ...list.slice(0, index),
  item,
  ...list.slice(index),
];

/**
 * Removal from a saved list: the item disappears at once (optimistic) and the toast offers
 * «Вернуть», which saves it again in the same position.
 */
function useUnsave<T extends { id: number }>(config: SavedList<T>) {
  const queryClient = useQueryClient();
  const key = queryKeys.me.favorites;

  const updateList = (update: (list: T[]) => T[]) =>
    queryClient.setQueryData<Favorites>(key, (favorites) =>
      favorites ? config.replace(favorites, update(config.select(favorites))) : favorites,
    );

  const restore = useMutation({
    mutationFn: ({ item }: { item: T; index: number }) => config.add(item.id),
    onMutate: async ({ item, index }) => {
      await queryClient.cancelQueries({ queryKey: key });
      updateList((list) => insertAt(list, index, item));
      config.syncDetail(queryClient, item.id, true);
    },
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  return useMutation({
    mutationFn: (item: T) => config.remove(item.id),
    onMutate: async (item) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Favorites>(key);
      const index = previous ? config.select(previous).findIndex(({ id }) => id === item.id) : 0;
      updateList((list) => list.filter(({ id }) => id !== item.id));
      config.syncDetail(queryClient, item.id, false);
      return { previous, index: Math.max(0, index) };
    },
    onError: (error, item, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      config.syncDetail(queryClient, item.id, true);
      toast.error(errorMessage(error));
    },
    onSuccess: (_result, item, context) => {
      toast.success(config.removedText, {
        label: 'Вернуть',
        onClick: () => restore.mutate({ item, index: context.index }),
      });
    },
  });
}

export const useUnsavePlace = () => useUnsave(PLACES);
export const useUnsaveRoute = () => useUnsave(ROUTES);
