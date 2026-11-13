import { useEffect, useRef, useState } from 'react';

import { usePlaceParam } from '@/features/map';
import type { PlaceCard } from '@/shared/api';

/**
 * The event last opened from the map or the list stays highlighted after its card closes,
 * and the list scrolls to it — so a marker tap and the list stay in sync.
 */
export function useMarkerHighlight(events: readonly PlaceCard[] | undefined) {
  const { placeId } = usePlaceParam();
  const listRef = useRef<HTMLDivElement>(null);
  const [highlightId, setHighlightId] = useState<number | null>(null);

  const inList = placeId !== null && events?.some((place) => place.id === placeId) === true;
  if (inList && placeId !== highlightId) setHighlightId(placeId);

  useEffect(() => {
    if (highlightId === null) return;
    const item = listRef.current?.querySelector<HTMLElement>(`[data-event-id="${highlightId}"]`);
    // Scroll only the panel body: `scrollIntoView` would also shift the clipped sheet itself.
    const scroller = item?.closest<HTMLElement>('[data-sheet-scroll]');
    if (!item || !scroller) return;
    const offset = item.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    scroller.scrollTo({
      top: scroller.scrollTop + offset - (scroller.clientHeight - item.offsetHeight) / 2,
      behavior: 'smooth',
    });
  }, [highlightId]);

  return { listRef, highlightId };
}
