import { useEffect, useState } from 'react';

import { useMapViewport, useUserLocation } from '@/features/map';
import type { Bounds, LatLng } from '@/shared/lib/geo';

/** Scrolled further down than this, a new map view does not re-sort the list by itself. */
const READING_SCROLL_PX = 160;

export interface ListView {
  /** The part of the map the list puts first; `undefined` until the map reports it. */
  bounds: Bounds | undefined;
  /** Where distances are measured from: the viewer, else the map centre. */
  center: LatLng | undefined;
}

const NO_VIEW: ListView = { bounds: undefined, center: undefined };

/**
 * The map view the «Карта» list is ordered by. The map reports its view when it stops moving;
 * the list follows at once while the reader is at its top. Further down it keeps its order —
 * nothing jumps under the reader's eyes — and offers «Обновить порядок» (`stale`) until they
 * tap it or scroll back up.
 */
export function useListOrder() {
  const viewport = useMapViewport();
  const { location } = useUserLocation();
  // An element inside the list: its scroll container tells whether the reader is down the list.
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [reading, setReading] = useState(false);
  const [view, setView] = useState<ListView>(NO_VIEW);
  const [seen, setSeen] = useState<unknown>(null);
  const [stale, setStale] = useState(false);

  const center = location?.point ?? viewport?.center;
  const latest: ListView = { bounds: viewport?.bounds, center };
  const signature = viewport ? [viewport.bounds, center] : null;
  const changed = signature !== null && JSON.stringify(signature) !== JSON.stringify(seen ?? null);

  // Adjusting state while rendering (React's pattern for "react to a new value"): a new view
  // re-sorts the list unless the reader is further down it.
  if (changed) {
    setSeen(signature);
    if (reading && view.bounds) setStale(true);
    else setView(latest);
  } else if (stale && !reading) {
    setStale(false);
    setView(latest);
  }

  useEffect(() => {
    const scroller = anchor?.closest<HTMLElement>('[data-sheet-scroll]');
    if (!scroller) return;
    const onScroll = () => setReading(scroller.scrollTop > READING_SCROLL_PX);
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, [anchor]);

  /** «Обновить порядок»: the current view, from the top of the list. */
  const refresh = () => {
    setStale(false);
    setView(latest);
    anchor?.closest<HTMLElement>('[data-sheet-scroll]')?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /** `anchor`: pass as the `ref` of an element inside the list. */
  return { view, stale, refresh, anchor: setAnchor };
}
