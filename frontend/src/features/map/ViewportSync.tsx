import { useEffect } from 'react';

import { fromLngLat } from '@/shared/lib/geo';

import { useMap } from './mapContext';
import { useMapStore } from './store';

const VIEWPORT_DEBOUNCE_MS = 250;

/** Mirrors the camera into the map store (debounced) so sections can react to the viewport. */
export function ViewportSync() {
  const { map } = useMap();

  useEffect(() => {
    if (!map) return;
    let timer = 0;

    const publish = () => {
      const bounds = map.getBounds();
      useMapStore.getState().setViewport({
        center: fromLngLat(map.getCenter()),
        zoom: map.getZoom(),
        bounds: {
          minLng: bounds.southWest[0] ?? 0,
          minLat: bounds.southWest[1] ?? 0,
          maxLng: bounds.northEast[0] ?? 0,
          maxLat: bounds.northEast[1] ?? 0,
        },
      });
    };
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(publish, VIEWPORT_DEBOUNCE_MS);
    };

    publish();
    map.on('moveend', schedule);
    map.on('resize', schedule);
    return () => {
      window.clearTimeout(timer);
      map.off('moveend', schedule);
      map.off('resize', schedule);
    };
  }, [map]);

  return null;
}
