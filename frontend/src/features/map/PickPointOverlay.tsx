import type { MapPointerEvent } from '@2gis/mapgl/types';
import { useEffect, useState } from 'react';

import { cn } from '@/shared/lib/cn';
import { fromLngLat } from '@/shared/lib/geo';

import { useMap } from './mapContext';
import { PIN_PATH } from './pin';
import { useMapStore } from './store';

/**
 * "Pick a point" mode: a pin fixed in the centre of the visible map area. Dragging the
 * map moves the point under it; clicking the map jumps there.
 */
export function PickPointOverlay() {
  const { map } = useMap();
  const picking = useMapStore((state) => state.picking);
  const padding = useMapStore((state) => state.padding);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    if (!map || !picking) return;
    const { setPickedPoint } = useMapStore.getState();

    const onMoveStart = () => setMoving(true);
    const onMoveEnd = () => {
      setMoving(false);
      setPickedPoint(fromLngLat(map.getCenter()));
    };
    const onClick = (event: MapPointerEvent) => {
      map.setCenter(event.lngLat, { duration: 300, easing: 'easeOutCubic' });
    };

    setPickedPoint(fromLngLat(map.getCenter()));
    map.on('movestart', onMoveStart);
    map.on('moveend', onMoveEnd);
    map.on('click', onClick);
    return () => {
      map.off('movestart', onMoveStart);
      map.off('moveend', onMoveEnd);
      map.off('click', onClick);
    };
  }, [map, picking]);

  if (!picking) return null;

  return (
    <div
      aria-hidden
      style={{ inset: `${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px` }}
      className="pointer-events-none absolute z-10 flex animate-fade-in items-center justify-center"
    >
      <div className="relative size-0">
        <span
          className={cn(
            'absolute -top-1 -left-2.5 h-2 w-5 rounded-[50%] bg-ink/30 blur-[1px] transition-transform duration-150',
            moving && 'scale-75',
          )}
        />
        <svg
          viewBox="0 0 40 46"
          className={cn(
            'absolute -top-[54px] -left-6 h-[55px] w-12 drop-shadow-[0_3px_4px_rgb(11_29_46/0.35)] transition-transform duration-150 ease-out-soft',
            moving && '-translate-y-2.5',
          )}
        >
          <path d={PIN_PATH} fill="var(--color-brand)" stroke="#fff" strokeWidth={2} />
          <circle cx="20" cy="20" r="5.5" fill="var(--color-beam)" />
        </svg>
      </div>
    </div>
  );
}
