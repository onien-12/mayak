import type { PlaceCard } from '@/shared/api';

import { useCollectionDetails, useCollectionMembership, useMyCollections } from './useCollections';

/** Which of my collections contain the place, and toggling that. */
export function usePlaceMembership(place: PlaceCard, enabled = true) {
  const mine = useMyCollections();
  const collections = enabled ? (mine.data ?? []) : [];
  const details = useCollectionDetails(collections.map(({ id }) => id));
  const membership = useCollectionMembership();

  const memberById = new Map(
    collections.map((collection, index) => {
      const detail = details[index]?.data;
      return [collection.id, detail?.places.some(({ id }) => id === place.id)] as const;
    }),
  );

  /** `undefined` while the collection is still loading. */
  const isMember = (collectionId: number) => memberById.get(collectionId);

  const toggle = (collectionId: number, member = !isMember(collectionId)) =>
    membership.mutate({ collectionId, place, member });

  return {
    collections,
    isMember,
    toggle,
    /** In at least one collection — the trigger shows a filled state. */
    saved: [...memberById.values()].some(Boolean),
    isPending: mine.isPending,
    isError: mine.isError,
    error: mine.error,
    refetch: mine.refetch,
  };
}
