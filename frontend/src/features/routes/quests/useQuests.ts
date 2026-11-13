import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  ApiError,
  errorMessage,
  queryKeys,
  questsApi,
  rereadAfterCheck,
  type QuestRun,
  type QuestsQuery,
  type ReviewInput,
} from '@/shared/api';
import { toast } from '@/shared/ui';

const NOT_FOUND = 404;
/** Team runs are shared: a teammate may pass the stage at any moment. */
export const TEAM_POLL_MS = 4000;

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === NOT_FOUND;
}

/** Id from a `:id` URL segment (`NaN` when malformed). */
export function parseId(raw: string | undefined): number {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : NaN;
}

const retryUnlessMissing = (count: number, error: unknown) => !isNotFound(error) && count < 1;

export function useQuestsCatalog(query: QuestsQuery, mine: boolean) {
  return useQuery({
    queryKey: mine ? queryKeys.quests.mine : queryKeys.quests.list(query),
    queryFn: ({ signal }) => (mine ? questsApi.mine() : questsApi.list(query, signal)),
    placeholderData: keepPreviousData,
  });
}

export function useQuest(id: number) {
  return useQuery({
    queryKey: queryKeys.quests.detail(id),
    queryFn: () => questsApi.get(id),
    enabled: Number.isInteger(id) && id > 0,
    retry: retryUnlessMissing,
  });
}

export function useQuestEditorData(id: number) {
  return useQuery({
    queryKey: queryKeys.quests.editor(id),
    queryFn: () => questsApi.editor(id),
    enabled: Number.isInteger(id) && id > 0,
    retry: retryUnlessMissing,
  });
}

export function useQuestResults(id: number) {
  return useQuery({ queryKey: queryKeys.quests.results(id), queryFn: () => questsApi.results(id) });
}

export function useQuestReviews(id: number) {
  return useQuery({ queryKey: queryKeys.quests.reviews(id), queryFn: () => questsApi.reviews(id) });
}

export function useSaveQuestReview(id: number, updating: boolean) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ReviewInput) => questsApi.saveReview(id, input),
    onSuccess: () => {
      toast.success(updating ? 'Отзыв обновлён' : 'Спасибо за отзыв!');
      const keys = [queryKeys.quests.reviews(id), queryKeys.quests.detail(id)];
      for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: queryKeys.quests.lists });
      rereadAfterCheck(keys);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

export function useDeleteQuest(id: number, onDeleted: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => questsApi.remove(id),
    onSuccess: () => {
      toast.success('Квест удалён');
      queryClient.removeQueries({ queryKey: queryKeys.quests.detail(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.quests.all });
      onDeleted();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

/** The run, polled while it is a team game in progress. */
export function useQuestRun(runId: number) {
  return useQuery({
    queryKey: queryKeys.quests.run(runId),
    queryFn: () => questsApi.run(runId),
    enabled: Number.isInteger(runId) && runId > 0,
    retry: retryUnlessMissing,
    refetchInterval: (query) => {
      const run = query.state.data;
      return run?.is_team && !run.finished && !run.abandoned ? TEAM_POLL_MS : false;
    },
  });
}

/** Puts a fresh run state into the cache (after a check, a hint, a lead change). */
export function useStoreRun() {
  const queryClient = useQueryClient();
  return (run: QuestRun) => {
    queryClient.setQueryData(queryKeys.quests.run(run.id), run);
    if (run.finished) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.quests.detail(run.quest_id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.quests.results(run.quest_id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.quests.lists });
    }
  };
}
