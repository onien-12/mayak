import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

export type SavedTab = 'places' | 'routes' | 'collections';

export const SAVED_TABS: readonly SavedTab[] = ['places', 'routes', 'collections'];
const TAB_PARAM = 'tab';

const isSavedTab = (value: string | null): value is SavedTab =>
  SAVED_TABS.some((tab) => tab === value);

/** Active tab of «Избранное» in the URL (`?tab=routes`) — survives reloads and shared links. */
export function useSavedTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get(TAB_PARAM);
  const tab: SavedTab = isSavedTab(raw) ? raw : 'places';

  const setTab = useCallback(
    (next: SavedTab) =>
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (next === 'places') params.delete(TAB_PARAM);
          else params.set(TAB_PARAM, next);
          return params;
        },
        { replace: true },
      ),
    [setSearchParams],
  );

  return { tab, setTab };
}
