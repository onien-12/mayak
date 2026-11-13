import { useEffect } from 'react';
import { useBlocker } from 'react-router';

/**
 * Unsaved-changes guard: blocks in-app navigation away from the builder (the caller shows
 * a confirm dialog from the returned blocker) and asks the browser before closing the tab.
 * Query-only changes (`?place=`, `?at=`) on the same page are not blocked.
 */
export function useLeaveGuard(active: boolean) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      active && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [active]);

  return blocker;
}
