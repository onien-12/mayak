import { useState } from 'react';
import { useNavigate } from 'react-router';

import { requireAuth } from '@/features/auth';

import type { StartNewChoice } from './StartNewDialog';
import { clearDraft, type DraftKind } from './storage';
import { summarize } from './summaries';
import { useLocalDrafts } from './useLocalDrafts';

/**
 * «Создать маршрут / квест»: straight into the builder, or — when an unfinished new draft is on
 * this device — a question first: continue it or start again.
 */
export function useStartNew(kind: DraftKind, path: string, reason: string) {
  const navigate = useNavigate();
  const pending = useLocalDrafts(kind).find((draft) => draft.id === null) ?? null;
  const summary = pending ? summarize(kind, pending.draft) : null;
  const [open, setOpen] = useState(false);

  const start = () =>
    requireAuth(() => (pending && summary ? setOpen(true) : navigate(path)), reason);

  const choice: StartNewChoice | null =
    pending && summary
      ? {
          open,
          summary: `«${summary.title}» · ${summary.facts}`,
          savedAt: pending.savedAt,
          onContinue: () => {
            setOpen(false);
            navigate(`${path}?draft=1`);
          },
          onFresh: () => {
            clearDraft(kind, null);
            setOpen(false);
            navigate(path);
          },
          onClose: () => setOpen(false),
        }
      : null;

  return { start, choice };
}
