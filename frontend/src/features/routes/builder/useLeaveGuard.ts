import { useEffect } from 'react';
import { useBlocker } from 'react-router';

/**
 * Unsaved-changes guard: blocks in-app navigation away from the builder (the caller shows a
 * dialog from the returned blocker). The browser is asked before closing the tab only when
 * `unloadWarning` — the work could not be kept on this device; otherwise the draft is written
 * as the page goes away. Query-only changes (`?place=`, `?at=`) on the same page are not blocked.
 */
export function useLeaveGuard(active: boolean, { unloadWarning = true } = {}) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      active && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!active || !unloadWarning) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [active, unloadWarning]);

  return blocker;
}
