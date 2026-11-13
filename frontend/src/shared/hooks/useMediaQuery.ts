import { useCallback, useSyncExternalStore } from 'react';

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    },
    [query],
  );
  // Stable per query, so React does not re-evaluate the media query after every commit.
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** ≥ 1024 px: nav rail + side panel. Below: bottom tab bar + bottom sheet. */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1024px)');
}
