import { formatRelative, pluralize } from '@/shared/lib/format';

import { isRouteDraft, visibleCount } from '../builder/model';
import { ROUTE_PLURALS } from '../lib/plurals';
import { QUEST_PLURALS } from '../quests/lib/meta';
import { filledStages, isQuestDraft } from '../quests/editor/model';
import type { DraftKind } from './storage';

export const UNTITLED = 'Без названия';

export interface DraftSummary {
  title: string;
  /** «3 точки», «2 этапа». */
  facts: string;
}

/** What a stored draft is, for lists and questions; `null` for something unreadable. */
export function summarize(kind: DraftKind, draft: unknown): DraftSummary | null {
  if (kind === 'route') {
    if (!isRouteDraft(draft)) return null;
    return {
      title: draft.title.trim() || UNTITLED,
      facts: pluralize(visibleCount(draft.stops), ROUTE_PLURALS.point),
    };
  }
  if (!isQuestDraft(draft)) return null;
  return {
    title: draft.title.trim() || UNTITLED,
    facts: pluralize(filledStages(draft.stages).length, QUEST_PLURALS.stage),
  };
}

/** «только что», «5 минут назад» — never «сейчас» for something saved a moment ago. */
export function savedAgo(iso: string): string {
  return formatRelative(iso, new Date(Math.max(Date.now(), Date.parse(iso) + 1)));
}
