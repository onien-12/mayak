import { useEffect, useState } from 'react';

import { listDrafts, subscribeDrafts, type DraftKind, type LocalDraft } from './storage';

/** Drafts of one kind kept on this device, live: updated as builders save or clear them. */
export function useLocalDrafts(kind: DraftKind): LocalDraft[] {
  const [drafts, setDrafts] = useState(() => listDrafts(kind));
  useEffect(() => subscribeDrafts(() => setDrafts(listDrafts(kind))), [kind]);
  return drafts;
}
