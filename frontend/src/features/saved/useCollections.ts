import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth';
import {
  ApiError,
  collectionsApi,
  errorMessage,
  queryKeys,
  type Collection,
  type CollectionDetail,
  type CollectionInput,
  type CollectionsQuery,
  type PlaceCard,
} from '@/shared/api';
import { ACTION_TOAST_TTL_MS, toast } from '@/shared/ui';

const NOT_FOUND = 404;
const MINE: CollectionsQuery = { scope: 'mine' };
export const PUBLIC_COLLECTIONS: CollectionsQuery = { scope: 'public', limit: 24 };

export function useMyCollections() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: queryKeys.collections.list(MINE),
    queryFn: () => collectionsApi.list(MINE),
    enabled: isAuthenticated,
  });
}

export function usePublicCollections() {
  return useQuery({
    queryKey: queryKeys.collections.list(PUBLIC_COLLECTIONS),
    queryFn: () => collectionsApi.list(PUBLIC_COLLECTIONS),
  });
}

export function useCollection(id: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.collections.detail(id),
    queryFn: () => collectionsApi.get(id),
    enabled: enabled && Number.isInteger(id) && id > 0,
    retry: (count, error) =>
      !(error instanceof ApiError && error.status === NOT_FOUND) && count < 1,
  });
}

/** Details (with places) of several collections — for membership checkmarks. */
export function useCollectionDetails(ids: readonly number[]) {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: queryKeys.collections.detail(id),
      queryFn: () => collectionsApi.get(id),
    })),
  });
}

export function useSaveCollection(collection?: Collection) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CollectionInput) =>
      collection ? collectionsApi.update(collection.id, input) : collectionsApi.create(input),
    onSuccess: (saved) => {
      queryClient.setQueryData<CollectionDetail>(
        queryKeys.collections.detail(saved.id),
        (detail) => (detail ? { ...detail, ...saved } : detail),
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.collections.all });
      toast.success(collection ? 'Подборка сохранена' : 'Подборка создана');
    },
  });
}

export function useDeleteCollection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => collectionsApi.remove(id),
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: queryKeys.collections.detail(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.collections.lists });
      toast.success('Подборка удалена');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

interface MembershipInput {
  collectionId: number;
  place: PlaceCard;
  /** `true` — add the place, `false` — remove it. */
  member: boolean;
}

function withMembership(detail: CollectionDetail, place: PlaceCard, member: boolean) {
  const places = detail.places.filter(({ id }) => id !== place.id);
  if (member) places.push(place);
  return { ...detail, places, items_count: places.length };
}

/** Adds a place to / removes it from a collection, optimistically. */
export function useCollectionMembership() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ collectionId, place, member }: MembershipInput) =>
      member
        ? collectionsApi.addPlace(collectionId, place.id)
        : collectionsApi.removePlace(collectionId, place.id),
    onMutate: async ({ collectionId, place, member }) => {
      const key = queryKeys.collections.detail(collectionId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<CollectionDetail>(key);
      if (previous) queryClient.setQueryData(key, withMembership(previous, place, member));
      return { previous };
    },
    onError: (error, { collectionId }, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.collections.detail(collectionId), context.previous);
      }
      toast.error(errorMessage(error));
    },
    onSettled: (_result, _error, { collectionId }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.collections.detail(collectionId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.collections.lists });
    },
  });
}

/**
 * Takes a place out of a collection with «Вернуть»: the place leaves the list at once, but
 * the request is sent only when the undo window closes, so «Вернуть» puts it back exactly
 * where it was (the server orders places by when they were added).
 */
export function useRemoveFromCollection() {
  const queryClient = useQueryClient();

  return (collectionId: number, place: PlaceCard) => {
    const key = queryKeys.collections.detail(collectionId);
    const previous = queryClient.getQueryData<CollectionDetail>(key);
    const index = previous?.places.findIndex(({ id }) => id === place.id) ?? -1;
    void queryClient.cancelQueries({ queryKey: key });
    if (previous) queryClient.setQueryData(key, withMembership(previous, place, false));

    const restore = () =>
      queryClient.setQueryData<CollectionDetail>(key, (current) => {
        if (!current || current.places.some(({ id }) => id === place.id)) return current;
        const places = current.places.toSpliced(Math.max(0, index), 0, place);
        return { ...current, places, items_count: places.length };
      });

    const commit = window.setTimeout(() => {
      collectionsApi
        .removePlace(collectionId, place.id)
        .catch((error: unknown) => {
          restore();
          toast.error(errorMessage(error));
        })
        .finally(() => {
          void queryClient.invalidateQueries({ queryKey: key });
          void queryClient.invalidateQueries({ queryKey: queryKeys.collections.lists });
        });
    }, ACTION_TOAST_TTL_MS);

    toast.success('Место убрано из подборки', {
      label: 'Вернуть',
      onClick: () => {
        window.clearTimeout(commit);
        restore();
      },
    });
  };
}
