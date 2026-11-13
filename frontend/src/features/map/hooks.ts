import { useCallback, useEffect, useEffectEvent, useMemo } from 'react';
import { useSearchParams } from 'react-router';

import type { PlaceCard } from '@/shared/api';
import { toLngLat, type Bounds, type LatLng, type LngLat } from '@/shared/lib/geo';

import { useMap } from './mapContext';
import { useSceneStore, type FoldPredicate } from './sceneStore';
import { useMapStore, type MapViewport } from './store';
import type { MapPadding } from './types';

const FLY_MS = 500;
const PLACE_PARAM = 'place';
const AREA_PARAM = 'area';
/** URL parameters of the other cards an opened area replaces (`useSpotParam`, `useStackParam`). */
const SPOT_PARAMS = ['at', 'obj', 'stack'] as const;

/**
 * Below this zoom, places that a section folds (`useMapPlaces(…, { fold })`) are hidden —
 * their area marker represents them; at and above it they appear as ordinary pins.
 */
export const PLACE_UNFOLD_ZOOM = 15.5;

/** Debounced snapshot of the visible map area (`null` until the map is ready). */
export function useMapViewport(): MapViewport | null {
  return useMapStore((state) => state.viewport);
}

interface FlyOptions {
  /** Zoom in to at least this level; never zooms out. */
  minZoom?: number;
}

interface FitOptions {
  maxZoom?: number;
  /** Extra space around the bounds, px (on top of the panel-aware map padding). */
  padding?: number;
}

export interface MapActions {
  /** `false` until the map is ready — actions are no-ops before that. */
  ready: boolean;
  flyTo: (point: LatLng, options?: FlyOptions) => void;
  fitBounds: (bounds: Bounds, options?: FitOptions) => void;
  zoomBy: (delta: number) => void;
}

/**
 * The last camera move. A padding change (the sheet snapping, the map becoming ready)
 * interrupts camera animations, so a move requested just before it is replayed against
 * the new padding — e.g. «show the route and drop the sheet» lands where it should.
 */
let lastMove: { run: () => void; at: number } | null = null;
const REPLAY_WINDOW_MS = FLY_MS + 100;

function moveCamera(run: () => void): void {
  lastMove = { run, at: performance.now() };
  run();
}

function takeRecentMove(): (() => void) | null {
  const move = lastMove && performance.now() - lastMove.at < REPLAY_WINDOW_MS ? lastMove : null;
  lastMove = null;
  return move?.run ?? null;
}

/**
 * Camera controls. All moves respect the map padding, so targets land in the part of the
 * map that is not covered by the side panel or the bottom sheet.
 */
export function useMapActions(): MapActions {
  const { map } = useMap();

  return useMemo<MapActions>(
    () => ({
      ready: map !== null,
      flyTo: (point, { minZoom } = {}) => {
        if (!map) return;
        moveCamera(() => {
          map.setCenter(toLngLat(point), { duration: FLY_MS, easing: 'easeOutCubic' });
          if (minZoom !== undefined && map.getZoom() < minZoom) {
            map.setZoom(minZoom, { duration: FLY_MS, easing: 'easeOutCubic' });
          }
        });
      },
      fitBounds: (bounds, { maxZoom = 16, padding = 56 } = {}) => {
        if (!map) return;
        moveCamera(() =>
          map.fitBounds(
            {
              southWest: [bounds.minLng, bounds.minLat],
              northEast: [bounds.maxLng, bounds.maxLat],
            },
            {
              maxZoom,
              padding: { top: padding, right: padding, bottom: padding, left: padding },
              animation: { duration: FLY_MS, easing: 'easeOutCubic' },
            },
          ),
        );
      },
      zoomBy: (delta) => {
        map?.setZoom(map.getZoom() + delta, { duration: 250, easing: 'easeOutCubic' });
      },
    }),
    [map],
  );
}

/** Tells the map which part of it is covered by UI (called by the app shell). */
export function useMapPadding({ top, right, bottom, left }: MapPadding): void {
  const { map } = useMap();
  const setPadding = useMapStore((state) => state.setPadding);

  useEffect(() => {
    setPadding({ top, right, bottom, left });
    if (!map) return;
    const replay = takeRecentMove();
    map.setPadding(
      { top, right, bottom, left },
      { duration: replay ? 0 : 200, easing: 'easeOutCubic' },
    );
    map.setControlsLayoutPadding({ top, right, bottom, left });
    if (replay) requestAnimationFrame(replay);
  }, [map, setPadding, top, right, bottom, left]);
}

interface MapPlacesOptions {
  /** Called instead of opening the place card when a marker is clicked. */
  onSelect?: (place: PlaceCard) => void;
  /**
   * Opt-in folding: places for which it returns `true` are hidden while the map is zoomed
   * out below `PLACE_UNFOLD_ZOOM` (an aggregate marker such as their area stands for them),
   * unless their area is unfolded with `useMapUnfoldArea`. Keep the function stable
   * (`useCallback`) — a new identity re-filters the layer.
   */
  fold?: FoldPredicate;
}

/**
 * Draws the given places as clustered markers while the calling component is mounted.
 * Clicking a marker opens the place card (`?place=<id>`), or calls `onSelect` when given.
 * One section at a time owns the marker layer; pass `undefined` while loading to keep the
 * previous markers on screen.
 */
export function useMapPlaces(
  places: readonly PlaceCard[] | undefined,
  { onSelect, fold }: MapPlacesOptions = {},
): void {
  const setSectionPlaces = useSceneStore((state) => state.setSectionPlaces);
  const setOnSelect = useSceneStore((state) => state.setOnSelect);
  const setFold = useSceneStore((state) => state.setFold);
  const select = useEffectEvent((place: PlaceCard) => onSelect?.(place));
  const custom = onSelect !== undefined;

  useEffect(() => {
    if (places) setSectionPlaces(places);
  }, [places, setSectionPlaces]);

  useEffect(() => {
    if (!fold) return;
    setFold(fold);
    return () => setFold(null);
  }, [fold, setFold]);

  useEffect(() => () => setSectionPlaces([]), [setSectionPlaces]);

  useEffect(() => {
    if (!custom) return;
    setOnSelect((place) => select(place));
    return () => setOnSelect(null);
  }, [custom, setOnSelect]);
}

/** Keeps the opened place on the map even when the current section's list lacks it. */
export function useMapFocusPlace(place: PlaceCard | null | undefined): void {
  const setFocusPlace = useSceneStore((state) => state.setFocusPlace);

  useEffect(() => {
    setFocusPlace(place ?? null);
    return () => setFocusPlace(null);
  }, [place, setFocusPlace]);
}

/**
 * Keeps extra places on the map while mounted, on top of the section's own list — e.g. the
 * places of an open area. Pass `undefined` while loading.
 */
export function useMapExtraPlaces(places: readonly PlaceCard[] | undefined): void {
  const setExtraPlaces = useSceneStore((state) => state.setExtraPlaces);

  useEffect(() => {
    if (!places) return;
    setExtraPlaces(places);
    return () => setExtraPlaces([]);
  }, [places, setExtraPlaces]);
}

/**
 * Marks places as recommended to the viewer («Для вас») while mounted: they are drawn even
 * when the section's list lacks them, stay visible when zoomed out (never folded into their
 * area, never clustered) and carry a quiet accent. Pass `undefined` while loading.
 */
export function useMapRecommended(places: readonly PlaceCard[] | undefined): void {
  const setRecommended = useSceneStore((state) => state.setRecommended);

  useEffect(() => {
    if (!places) return;
    setRecommended(places);
    return () => setRecommended([]);
  }, [places, setRecommended]);
}

/** Shows the folded places of this area at any zoom while mounted (its card is open). */
export function useMapUnfoldArea(areaId: number | null | undefined): void {
  const unfoldArea = useSceneStore((state) => state.unfoldArea);

  useEffect(() => {
    if (areaId === null || areaId === undefined) return;
    return unfoldArea(areaId);
  }, [areaId, unfoldArea]);
}

/**
 * Positions of the place markers on the map (`[lng, lat]`, before clustering) — for laying
 * out other labels around them. Changes identity only when the markers move.
 */
export function useMapMarkerPoints(): readonly LngLat[] {
  const anchors = useSceneStore((state) => state.anchors);
  return useMemo(() => anchors.map((anchor) => anchor.coordinates), [anchors]);
}

/** `true` while "pick a point" mode owns the map (other markers should step aside). */
export function useMapPicking(): boolean {
  return useMapStore((state) => state.picking);
}

/** `true` while the camera is below `PLACE_UNFOLD_ZOOM` (folded places are hidden). */
export function useMapFolded(): boolean {
  return useSceneStore((state) => state.zoomedOut);
}

/**
 * The `?area=<id>` query parameter: which area (location) card is open on top of the
 * section. Opening an area replaces an open place card or spot sheet; a place opened from
 * the area keeps the parameter, so closing the place returns to the area.
 */
export function useAreaParam() {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get(AREA_PARAM);
  const parsed = raw === null ? NaN : Number(raw);
  const areaId = Number.isInteger(parsed) && parsed > 0 ? parsed : null;

  const openArea = useCallback(
    (id: number) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set(AREA_PARAM, String(id));
        next.delete(PLACE_PARAM);
        for (const param of SPOT_PARAMS) next.delete(param);
        return next;
      });
    },
    [setSearchParams],
  );

  const closeArea = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete(AREA_PARAM);
      return next;
    });
  }, [setSearchParams]);

  return { areaId, openArea, closeArea };
}

/** The `?place=<id>` query parameter: which place card is open on top of the section. */
export function usePlaceParam() {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get(PLACE_PARAM);
  const parsed = raw === null ? NaN : Number(raw);
  const placeId = Number.isInteger(parsed) && parsed > 0 ? parsed : null;

  const openPlace = useCallback(
    (id: number) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set(PLACE_PARAM, String(id));
        return next;
      });
    },
    [setSearchParams],
  );

  const closePlace = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete(PLACE_PARAM);
      return next;
    });
  }, [setSearchParams]);

  return { placeId, openPlace, closePlace };
}

interface PickPoint {
  /** Current pin position; `null` until the map reports it. */
  point: LatLng | null;
  /** Moves the pin (and the map under it) to the given coordinates. */
  moveTo: (point: LatLng) => void;
}

/**
 * "Pick a point" mode for forms. While `active`, a pin is fixed in the centre of the
 * visible map: the user drags the map under it or clicks the map to jump there.
 *
 * @param initial Where to put the pin on activation (e.g. the edited place).
 */
export function usePickPoint(active: boolean, initial?: LatLng | null): PickPoint {
  const { flyTo, ready } = useMapActions();
  const point = useMapStore((state) => state.pickedPoint);
  const setPicking = useMapStore((state) => state.setPicking);

  const start = useEffectEvent(() => {
    setPicking(true);
    if (initial) flyTo(initial, { minZoom: 16 });
  });

  useEffect(() => {
    if (!active || !ready) return;
    start();
    return () => setPicking(false);
  }, [active, ready, setPicking]);

  const moveTo = useCallback((target: LatLng) => flyTo(target, { minZoom: 16 }), [flyTo]);

  return { point: active ? point : null, moveTo };
}
