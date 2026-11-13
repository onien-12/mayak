import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { resolveUserLocation } from '@/features/map';
import {
  ApiError,
  errorMessage,
  eventsApi,
  placesApi,
  queryKeys,
  type PlaceDetail,
  type PlaceUpdate,
  type VoteKind,
} from '@/shared/api';
import { toast } from '@/shared/ui';

const NOT_FOUND = 404;

export function usePlace(placeId: number) {
  return useQuery({
    queryKey: queryKeys.places.detail(placeId),
    queryFn: () => placesApi.get(placeId),
    retry: (count, error) =>
      !(error instanceof ApiError && error.status === NOT_FOUND) && count < 1,
  });
}

/** Stores a fresh `PlaceDetail` and refreshes everything derived from it (lists, markers, history). */
export function syncPlace(queryClient: QueryClient, place: PlaceDetail): void {
  queryClient.setQueryData(queryKeys.places.detail(place.id), place);
  void queryClient.invalidateQueries({ queryKey: queryKeys.places.lists });
  void queryClient.invalidateQueries({ queryKey: queryKeys.places.history(place.id) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.events.all });
}

interface OptimisticOptions<TInput> {
  placeId: number;
  mutationFn: (input: TInput) => Promise<PlaceDetail>;
  /** Pure prediction of the server result, applied to the cache immediately. */
  predict: (place: PlaceDetail, input: TInput) => PlaceDetail;
  onSuccess?: (place: PlaceDetail) => void;
}

/** Mutation that returns `PlaceDetail`: optimistic cache update, rollback and toast on error. */
function useOptimisticPlaceMutation<TInput>({
  placeId,
  mutationFn,
  predict,
  onSuccess,
}: OptimisticOptions<TInput>) {
  const queryClient = useQueryClient();
  const key = queryKeys.places.detail(placeId);

  return useMutation({
    mutationFn,
    onMutate: async (input: TInput) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<PlaceDetail>(key);
      if (previous) queryClient.setQueryData(key, predict(previous, input));
      return { previous };
    },
    onError: (error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast.error(errorMessage(error));
    },
    onSuccess: (place) => {
      syncPlace(queryClient, place);
      onSuccess?.(place);
    },
  });
}

function predictVote(place: PlaceDetail, kind: VoteKind): PlaceDetail {
  const verification = { ...place.verification };
  const previous = verification.my_vote?.kind;
  if (previous) verification[previous] = Math.max(0, verification[previous] - 1);
  verification[kind] += 1;
  verification.my_vote = { kind, created_at: new Date().toISOString() };
  return { ...place, verification };
}

interface VoteInput {
  kind: VoteKind;
  comment?: string;
}

/** Verification vote; attaches the user's coordinates when they are already available. */
export function useVote(placeId: number) {
  return useOptimisticPlaceMutation<VoteInput>({
    placeId,
    mutationFn: async ({ kind, comment }) => {
      const point = await resolveUserLocation();
      return placesApi.vote(placeId, {
        kind,
        comment: comment || undefined,
        lat: point?.lat,
        lng: point?.lng,
      });
    },
    predict: (place, { kind }) => predictVote(place, kind),
    onSuccess: () => toast.success('Спасибо! Ваш голос учтён'),
  });
}

function predictWithdrawal(place: PlaceDetail): PlaceDetail {
  const verification = { ...place.verification };
  const previous = verification.my_vote?.kind;
  if (previous) verification[previous] = Math.max(0, verification[previous] - 1);
  verification.my_vote = null;
  return { ...place, verification };
}

/** Takes the user's verification vote back. */
export function useWithdrawVote(placeId: number) {
  return useOptimisticPlaceMutation<void>({
    placeId,
    mutationFn: () => placesApi.withdrawVote(placeId),
    predict: predictWithdrawal,
    onSuccess: () => toast.success('Голос отменён'),
  });
}

function predictParticipation(place: PlaceDetail, join: boolean): PlaceDetail {
  if (!place.event) return place;
  const delta = join ? 1 : -1;
  const { seats_left } = place.event;
  return {
    ...place,
    event: {
      ...place.event,
      is_joined: join,
      participants_count: Math.max(0, place.event.participants_count + delta),
      seats_left: seats_left === null ? null : Math.max(0, seats_left - delta),
    },
  };
}

/** Join (`true`) or leave (`false`) an event. */
export function useParticipation(placeId: number) {
  const queryClient = useQueryClient();
  return useOptimisticPlaceMutation<boolean>({
    placeId,
    mutationFn: (join) => (join ? eventsApi.join(placeId) : eventsApi.leave(placeId)),
    predict: predictParticipation,
    onSuccess: (place) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.places.participants(placeId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.me.events });
      toast.success(place.event?.is_joined ? 'Вы участвуете!' : 'Вы больше не участвуете');
    },
  });
}

/** Adds (`true`) or removes (`false`) the place from favorites. */
export function useFavorite(placeId: number) {
  const queryClient = useQueryClient();
  const key = queryKeys.places.detail(placeId);

  return useMutation({
    mutationFn: (favorite: boolean) =>
      favorite ? placesApi.addFavorite(placeId) : placesApi.removeFavorite(placeId),
    onMutate: async (favorite) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<PlaceDetail>(key);
      if (previous) queryClient.setQueryData(key, { ...previous, is_favorite: favorite });
      return { previous };
    },
    onError: (error, _favorite, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast.error(errorMessage(error));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.me.favorites }),
  });
}

/** PATCH for small in-card changes (organizer controls); the full form lives in the editor. */
export function useUpdatePlace(placeId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (update: PlaceUpdate) => placesApi.update(placeId, update),
    onSuccess: (place) => syncPlace(queryClient, place),
    onError: (error) => toast.error(errorMessage(error)),
  });
}
