import { load } from '@2gis/mapgl';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { TWOGIS_KEY } from '@/shared/api';
import { toLngLat } from '@/shared/lib/geo';
import { useGraphicsStore } from '@/shared/ui';

import { MapContext, type MapContextValue } from './mapContext';
import { useMapStore } from './store';
import type { MapglApi, MapInstance, MapStatus } from './types';

interface MapRuntime {
  map: MapInstance | null;
  api: MapglApi | null;
  status: MapStatus;
}

const IDLE: MapRuntime = { map: null, api: null, status: TWOGIS_KEY ? 'loading' : 'no-key' };

/**
 * Owns the single MapGL instance of the app. The map is created once the `MapHost`
 * registers its container and lives until the provider unmounts — navigation between
 * sections never re-creates it, so the viewport is preserved.
 */
export function MapProvider({ children }: { children: ReactNode }) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [runtime, setRuntime] = useState<MapRuntime>(IDLE);

  useEffect(() => {
    if (!container || !TWOGIS_KEY) return;
    let cancelled = false;
    let map: MapInstance | null = null;

    load()
      .then((api) => {
        if (cancelled) return;
        if (!api.isSupported()) {
          setRuntime({ map: null, api: null, status: 'unsupported' });
          return;
        }
        const { view } = useMapStore.getState();
        // Lite graphics: MapGL's light preset. An init-only option — a tier chosen later in
        // the visit applies to the map from the next page load.
        const lite = useGraphicsStore.getState().tier === 'lite';
        map = new api.Map(container, {
          key: TWOGIS_KEY,
          center: toLngLat(view.center),
          zoom: view.zoom,
          lang: 'ru',
          zoomControl: false,
          copyright: 'bottomLeft',
          maxPitch: 45,
          enableTrackResize: true,
          ...(lite && { graphicsPreset: 'light' }),
        });
        setRuntime({ map, api, status: 'ready' });
      })
      .catch(() => {
        if (!cancelled) setRuntime({ map: null, api: null, status: 'error' });
      });

    return () => {
      cancelled = true;
      map?.destroy();
      setRuntime(IDLE);
    };
  }, [container]);

  const value = useMemo<MapContextValue>(
    () => ({ ...runtime, registerContainer: setContainer }),
    [runtime],
  );

  return <MapContext value={value}>{children}</MapContext>;
}
