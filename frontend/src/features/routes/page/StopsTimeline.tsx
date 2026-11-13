import { useEffect, useRef } from 'react';

import type { NumberedStop } from '../lib/stops';
import { StopItem } from './StopItem';

interface StopsTimelineProps {
  stops: readonly NumberedStop[];
  activePosition: number | null;
  onSelect: (position: number) => void;
  /** Bumped when a stop is chosen on the map — the list scrolls to it. */
  scrollSignal: number;
}

/** The journey as a vertical timeline; `via` shaping points are not listed. */
export function StopsTimeline({
  stops,
  activePosition,
  onSelect,
  scrollSignal,
}: StopsTimelineProps) {
  const items = useRef(new Map<number, HTMLLIElement>());

  useEffect(() => {
    if (scrollSignal === 0 || activePosition === null) return;
    items.current.get(activePosition)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [scrollSignal, activePosition]);

  return (
    <ol className="flex flex-col">
      {stops.map((item, index) => (
        <StopItem
          key={item.stop.position}
          ref={(node) => {
            if (node) items.current.set(item.stop.position, node);
            else items.current.delete(item.stop.position);
          }}
          item={item}
          last={index === stops.length - 1}
          active={item.stop.position === activePosition}
          onSelect={() => onSelect(item.stop.position)}
        />
      ))}
    </ol>
  );
}
