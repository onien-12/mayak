import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { DEFAULT_ZOOM, VLADIVOSTOK_CENTER, type Bounds, type LatLng } from '@/shared/lib/geo';

import type { MapPadding } from './types';

export interface MapView {
  center: LatLng;
  zoom: number;
}

export interface MapViewport extends MapView {
  /** Visible area, excluding the part covered by the side panel / bottom sheet. */
  bounds: Bounds;
}

export interface UserLocation {
  point: LatLng;
  accuracy: number;
  timestamp: number;
}

export type LocationStatus = 'idle' | 'locating' | 'denied' | 'unavailable';

interface MapState {
  /** Last camera position — persisted so a reload opens the same place. */
  view: MapView;
  /** Debounced snapshot of what the user currently sees; `null` until the map is ready. */
  viewport: MapViewport | null;
  /** Part of the map covered by UI — set by the app shell through `useMapPadding`. */
  padding: MapPadding;
  userLocation: UserLocation | null;
  locationStatus: LocationStatus;
  /** "Pick a point" mode: a pin fixed in the centre of the visible map area. */
  picking: boolean;
  pickedPoint: LatLng | null;
  /** Number of mounted capturing tap listeners (`useMapTap(…, { capture: true })`). */
  tapCaptures: number;
  setViewport: (viewport: MapViewport) => void;
  setPadding: (padding: MapPadding) => void;
  setUserLocation: (location: UserLocation) => void;
  setLocationStatus: (status: LocationStatus) => void;
  setPicking: (picking: boolean) => void;
  setPickedPoint: (point: LatLng) => void;
  addTapCapture: (delta: 1 | -1) => void;
}

export const useMapStore = create<MapState>()(
  persist(
    (set) => ({
      view: { center: VLADIVOSTOK_CENTER, zoom: DEFAULT_ZOOM },
      viewport: null,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      userLocation: null,
      locationStatus: 'idle',
      picking: false,
      pickedPoint: null,
      tapCaptures: 0,

      setViewport: (viewport) =>
        set({ viewport, view: { center: viewport.center, zoom: viewport.zoom } }),
      setPadding: (padding) => set({ padding }),
      setUserLocation: (userLocation) => set({ userLocation, locationStatus: 'idle' }),
      setLocationStatus: (locationStatus) => set({ locationStatus }),
      setPicking: (picking) => set({ picking, pickedPoint: null }),
      setPickedPoint: (pickedPoint) => set({ pickedPoint }),
      addTapCapture: (delta) => set((state) => ({ tapCaptures: state.tapCaptures + delta })),
    }),
    {
      name: 'mayak-map',
      partialize: (state) => ({ view: state.view }),
    },
  ),
);
