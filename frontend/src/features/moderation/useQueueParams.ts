import { useSearchParams } from 'react-router';

import type { Layer, ModerationQueueSort, ModerationTrigger, TargetType } from '@/shared/api';
import { LAYERS, MODERATION_TRIGGER_META } from '@/shared/lib/labels';

import type { QueueFilters } from './useModeration';

export type ModerationTab = 'open' | 'held' | 'resolved' | 'log';

const TABS: readonly ModerationTab[] = ['open', 'held', 'resolved', 'log'];
const TARGETS: readonly TargetType[] = ['place', 'route'];
export const SORTS: readonly ModerationQueueSort[] = ['risk', 'complaints', 'newest', 'oldest'];
const TRIGGERS = Object.keys(MODERATION_TRIGGER_META) as ModerationTrigger[];

function pick<T extends string>(options: readonly T[], raw: string | null): T | undefined {
  return options.find((option) => option === raw);
}

/** Tab and queue filters in the URL, so «back» from a case restores the same view. */
export function useQueueParams() {
  const [params, setParams] = useSearchParams();
  const tab = pick(TABS, params.get('tab')) ?? 'open';
  const filters: QueueFilters = {
    state: tab === 'resolved' ? 'resolved' : 'open',
    target_type: pick(TARGETS, params.get('target')),
    layer: pick(LAYERS, params.get('layer')),
    trigger: pick(TRIGGERS, params.get('trigger')),
    sort: pick(SORTS, params.get('sort')) ?? 'risk',
  };

  const update = (changes: Record<string, string | undefined>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(changes)) {
          if (value === undefined) next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );

  return {
    tab,
    filters,
    setTab: (value: ModerationTab) => update({ tab: value === 'open' ? undefined : value }),
    setTarget: (value: TargetType | undefined) =>
      update(value === 'route' ? { target: value, layer: undefined } : { target: value }),
    setLayer: (value: Layer | undefined) => update({ layer: value }),
    setTrigger: (value: ModerationTrigger | undefined) => update({ trigger: value }),
    setSort: (value: ModerationQueueSort) => update({ sort: value === 'risk' ? undefined : value }),
  };
}

export type QueueParams = ReturnType<typeof useQueueParams>;
