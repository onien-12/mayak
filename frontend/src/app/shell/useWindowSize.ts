import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void) {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
}

// Stable on purpose: a new `getSnapshot` every render makes React re-read it after each
// commit, and `innerHeight` forces a synchronous layout while the sheet or the map moves.
const getHeight = () => window.innerHeight;

export function useWindowHeight(): number {
  return useSyncExternalStore(subscribe, getHeight);
}
