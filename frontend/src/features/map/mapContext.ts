import { createContext, use } from 'react';

import type { MapglApi, MapInstance, MapStatus } from './types';

export interface MapContextValue {
  /** `null` until `status === 'ready'`. */
  map: MapInstance | null;
  api: MapglApi | null;
  status: MapStatus;
  registerContainer: (element: HTMLDivElement | null) => void;
}

export const MapContext = createContext<MapContextValue | null>(null);

/** Low-level access to the MapGL instance. Prefer the purpose-built hooks and components. */
export function useMap(): MapContextValue {
  const value = use(MapContext);
  if (!value) throw new Error('useMap must be used inside <MapProvider>');
  return value;
}
