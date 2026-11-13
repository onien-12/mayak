import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';

import {
  ApiError,
  errorMessage,
  moderationApi,
  queryKeys,
  type HeldItem,
  type HeldKind,
  type ModerationAction,
  type ModerationCase,
  type ModerationQueueQuery,
} from '@/shared/api';
import { toast } from '@/shared/ui';

export const PAGE_SIZE = 20;
const NOT_FOUND = 404;
const CONFLICT = 409;

/** Filters of the queue without paging — the identity of one infinite list. */
export type QueueFilters = Omit<ModerationQueueQuery, 'limit' | 'offset'>;

function nextOffset<T>(lastPage: readonly T[], pages: readonly (readonly T[])[]) {
  return lastPage.length < PAGE_SIZE ? undefined : pages.length * PAGE_SIZE;
}

export function useQueue(filters: QueueFilters) {
  return useInfiniteQuery({
    queryKey: queryKeys.moderation.queue(filters),
    queryFn: ({ pageParam }) =>
      moderationApi.queue({ ...filters, limit: PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
  });
}

export function useModerationLog() {
  return useInfiniteQuery({
    queryKey: queryKeys.moderation.log({ limit: PAGE_SIZE }),
    queryFn: ({ pageParam }) => moderationApi.log({ limit: PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
  });
}

export function useModerationSummary() {
  return useQuery({ queryKey: queryKeys.moderation.summary, queryFn: moderationApi.summary });
}

export function useCase(id: number | null) {
  return useQuery({
    queryKey: queryKeys.moderation.case(id ?? 0),
    queryFn: () => moderationApi.case(id ?? 0),
    enabled: id !== null,
    retry: (count, error) =>
      !(error instanceof ApiError && error.status === NOT_FOUND) && count < 1,
  });
}

/** Every cached queue list (all filters) — for the optimistic removal of a decided case. */
const QUEUE_PREFIX = [...queryKeys.moderation.all, 'queue'] as const;

interface ResolveInput {
  action: ModerationAction;
  reason: string;
}

/**
 * Resolves a case: the case disappears from every cached queue immediately, the summary and
 * the log refresh afterwards. A 409 (someone else was faster) reloads the case instead.
 */
export function useResolveCase(caseId: number, onResolved: (input: ResolveInput) => void) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ResolveInput) => moderationApi.resolve(caseId, input),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: QUEUE_PREFIX });
      const previous = queryClient.getQueriesData<InfiniteData<ModerationCase[]>>({
        queryKey: QUEUE_PREFIX,
      });
      queryClient.setQueriesData<InfiniteData<ModerationCase[]>>(
        { queryKey: QUEUE_PREFIX },
        (data) =>
          data && {
            ...data,
            pages: data.pages.map((page) => page.filter((item) => item.id !== caseId)),
          },
      );
      return { previous };
    },
    onError: (error, _input, context) => {
      for (const [key, data] of context?.previous ?? []) queryClient.setQueryData(key, data);
      if (error instanceof ApiError && error.status === CONFLICT) {
        toast.info('Это обращение уже решил другой модератор — показываем итог');
        void queryClient.invalidateQueries({ queryKey: queryKeys.moderation.case(caseId) });
      } else {
        toast.error(errorMessage(error));
      }
    },
    onSuccess: (detail, input) => {
      queryClient.setQueryData(queryKeys.moderation.case(caseId), detail);
      void queryClient.invalidateQueries({ queryKey: queryKeys.moderation.summary });
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.moderation.all, 'log'] });
      void queryClient.invalidateQueries({ queryKey: QUEUE_PREFIX, refetchType: 'none' });
      void queryClient.invalidateQueries({ queryKey: queryKeys.places.all });
      onResolved(input);
    },
  });
}

/** The next open case after `currentId` in the given queue order (one-off request), or `null`. */
export async function findNextCase(
  currentId: number,
  filters: QueueFilters,
): Promise<number | null> {
  const cases = await moderationApi.queue({ ...filters, state: 'open', limit: 5, offset: 0 });
  return cases.find((item) => item.id !== currentId)?.id ?? null;
}

/** Photos, comments, reviews and notes held on their own (SPEC §24.1), oldest first. */
export function useHeldItems(kind: HeldKind | undefined) {
  return useInfiniteQuery({
    queryKey: queryKeys.moderation.held({ kind }),
    queryFn: ({ pageParam }) => moderationApi.held({ kind, limit: PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
  });
}

const HELD_PREFIX = [...queryKeys.moderation.all, 'held'] as const;

export type HeldDecision = 'release' | 'remove';

interface HeldDecisionInput {
  item: HeldItem;
  action: HeldDecision;
  reason: string;
}

/**
 * Releases or removes a held item: it leaves every cached list at once; the summary and the
 * log refresh afterwards. A 409 means another moderator was faster.
 */
export function useDecideHeld(onDone: (input: HeldDecisionInput) => void) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ item, action, reason }: HeldDecisionInput) =>
      action === 'release'
        ? moderationApi.release(item.id, reason)
        : moderationApi.remove(item.id, reason),
    onMutate: async ({ item }) => {
      await queryClient.cancelQueries({ queryKey: HELD_PREFIX });
      const previous = queryClient.getQueriesData<InfiniteData<HeldItem[]>>({
        queryKey: HELD_PREFIX,
      });
      queryClient.setQueriesData<InfiniteData<HeldItem[]>>(
        { queryKey: HELD_PREFIX },
        (data) =>
          data && {
            ...data,
            pages: data.pages.map((page) => page.filter((held) => held.id !== item.id)),
          },
      );
      return { previous };
    },
    onError: (error, _input, context) => {
      if (error instanceof ApiError && error.status === CONFLICT) {
        toast.info('Это уже решил другой модератор');
      } else {
        for (const [key, data] of context?.previous ?? []) queryClient.setQueryData(key, data);
        toast.error(errorMessage(error));
      }
    },
    onSuccess: (_result, input) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.moderation.summary });
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.moderation.all, 'log'] });
      void queryClient.invalidateQueries({ queryKey: HELD_PREFIX, refetchType: 'none' });
      void queryClient.invalidateQueries({ queryKey: queryKeys.places.all });
      onDone(input);
    },
  });
}
