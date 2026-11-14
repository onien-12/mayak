import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';

import { useAuth } from '@/features/auth';
import { errorMessage, queryKeys, questsApi, routesApi } from '@/shared/api';
import { pluralize } from '@/shared/lib/format';
import { toast } from '@/shared/ui';

import { ROUTE_PLURALS } from '../lib/plurals';
import { QUEST_PLURALS } from '../quests/lib/meta';
import { DraftsBlock, type DraftRow } from './DraftsBlock';
import { clearDraft, type DraftKind } from './storage';
import { summarize, UNTITLED } from './summaries';
import { useLocalDrafts } from './useLocalDrafts';

interface AccountDraft {
  id: number;
  title: string;
  facts: string;
  updatedAt: string;
}

const BASE: Record<DraftKind, string> = { route: '/routes', quest: '/quests' };
const WHAT: Record<DraftKind, string> = { route: 'маршрут', quest: 'квест' };

/** The author's private routes or quests: drafts kept in the account. */
function useAccountDrafts(kind: DraftKind, enabled: boolean): AccountDraft[] {
  const routes = useQuery({
    queryKey: queryKeys.routes.mine,
    queryFn: routesApi.mine,
    enabled: enabled && kind === 'route',
  });
  const quests = useQuery({
    queryKey: queryKeys.quests.mine,
    queryFn: questsApi.mine,
    enabled: enabled && kind === 'quest',
  });
  if (!enabled) return [];
  if (kind === 'route') {
    return (routes.data ?? [])
      .filter((route) => route.visibility === 'private')
      .map((route) => ({
        id: route.id,
        title: route.title || UNTITLED,
        facts: pluralize(route.stops_count, ROUTE_PLURALS.point),
        updatedAt: route.updated_at,
      }));
  }
  return (quests.data ?? [])
    .filter((quest) => quest.visibility === 'private')
    .map((quest) => ({
      id: quest.id,
      title: quest.title || UNTITLED,
      facts: pluralize(quest.stages_count, QUEST_PLURALS.stage),
      updatedAt: quest.updated_at,
    }));
}

/**
 * «Черновики» of one kind above its catalog: what is unfinished on this device (a new one, edits
 * of existing ones) and the author's drafts in the account. Absent when there are none.
 */
export function CatalogDrafts({ kind }: { kind: DraftKind }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const local = useLocalDrafts(kind);
  const account = useAccountDrafts(kind, isAuthenticated);
  const remove = useMutation({
    mutationFn: (id: number) => (kind === 'route' ? routesApi.remove(id) : questsApi.remove(id)),
    onSuccess: (_, id) => {
      clearDraft(kind, id);
      toast.success('Черновик удалён');
      const keys = kind === 'route' ? queryKeys.routes : queryKeys.quests;
      void queryClient.invalidateQueries({ queryKey: keys.mine });
      void queryClient.invalidateQueries({ queryKey: keys.lists });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const base = BASE[kind];
  const accountIds = new Set(account.map((item) => item.id));
  const editedHere = new Map(
    local.filter((item) => item.id !== null).map((item) => [item.id, item]),
  );

  const deviceRows: DraftRow[] = local.flatMap((item) => {
    if (item.id !== null && accountIds.has(item.id)) return [];
    const summary = summarize(kind, item.draft);
    if (!summary) return [];
    const path = item.id === null ? `${base}/new` : `${base}/${item.id}/edit`;
    return [
      {
        key: `device-${item.id ?? 'new'}`,
        title: summary.title,
        facts: summary.facts,
        savedAt: item.savedAt,
        where: 'device',
        note: item.id === null ? undefined : `изменения к сохранённому ${WHAT[kind]}у`,
        onContinue: () => navigate(`${path}?draft=1`),
        remove: {
          title: 'Удалить черновик с этого устройства?',
          text: `«${summary.title}» — несохранённая работа на этом устройстве. Вернуть её будет нельзя.`,
          run: () => clearDraft(kind, item.id),
        },
      },
    ];
  });
  const accountRows: DraftRow[] = account.map((item) => {
    const here = editedHere.get(item.id);
    return {
      key: `account-${item.id}`,
      title: item.title,
      facts: item.facts,
      savedAt: here && here.savedAt > item.updatedAt ? here.savedAt : item.updatedAt,
      where: 'account',
      note: here ? 'есть правки на этом устройстве' : 'видите только вы',
      onContinue: () => navigate(`${base}/${item.id}/edit${here ? '?draft=1' : ''}`),
      remove: {
        title: 'Удалить черновик?',
        text: `«${item.title}» исчезнет из аккаунта. Это действие нельзя отменить.`,
        run: () => remove.mutate(item.id),
        busy: remove.isPending,
      },
    };
  });

  return <DraftsBlock rows={[...deviceRows, ...accountRows]} />;
}
