import type * as MapGL from '@2gis/mapgl/types';

/** The MapGL namespace returned by the async loader. */
export type MapglApi = typeof MapGL;
export type MapInstance = MapGL.Map;

/**
 * `loading` — script or style is on its way; `ready` — the map can be used;
 * `no-key` — `VITE_2GIS_KEY` is missing; `unsupported` — no WebGL; `error` — failed to load.
 */
export type MapStatus = 'loading' | 'ready' | 'no-key' | 'unsupported' | 'error';

export interface MapPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
