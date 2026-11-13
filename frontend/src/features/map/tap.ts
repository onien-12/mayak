import type { MapPointerEvent } from '@2gis/mapgl/types';
import { useCallback, useEffect, useEffectEvent } from 'react';
import { useSearchParams } from 'react-router';

import { wasPressJustHandled } from '@/shared/lib/pressGuard';
import type { LatLng } from '@/shared/lib/geo';

import { useMap } from './mapContext';
import { useMapStore } from './store';

export interface MapTap extends LatLng {
  /** Id of the 2GIS map object under the tap (building, organisation, stop…), if any. */
  objectId?: string;
}

interface MapTapOptions {
  /**
   * While mounted and enabled, this listener owns map taps: ordinary listeners (e.g. the
   * spot sheet) are muted — for editors where a tap means "put a point here".
   */
  capture?: boolean;
}

/**
 * Subscribes to taps on the **base map**. Not delivered: taps on our own markers, clusters
 * and dots, taps while "pick a point" mode is active (it owns map clicks), taps while a
 * capturing listener is mounted (unless this one captures), and the press that has just
 * closed a popover or menu.
 */
export function useMapTap(
  onTap: (tap: MapTap) => void,
  enabled = true,
  { capture = false }: MapTapOptions = {},
): void {
  const { map } = useMap();

  const deliver = useEffectEvent((tap: MapTap) => {
    if (!wasPressJustHandled()) onTap(tap);
  });

  const handle = useEffectEvent((event: MapPointerEvent) => {
    const target = event.originalEvent.target;
    const { picking, tapCaptures } = useMapStore.getState();
    if (picking || (!capture && tapCaptures > 0)) return;
    if (target instanceof Element && target.closest('[data-map-marker]')) return;
    const [lng, lat] = event.lngLat;
    if (lng === undefined || lat === undefined) return;
    // Deferred so that clicks consumed by map dots or a closing popover can veto the tap.
    window.setTimeout(deliver, 0, { lng, lat, objectId: event.target?.id });
  });

  useEffect(() => {
    if (!enabled || !capture) return;
    const { addTapCapture } = useMapStore.getState();
    addTapCapture(1);
    return () => addTapCapture(-1);
  }, [enabled, capture]);

  useEffect(() => {
    if (!map || !enabled) return;
    const listener = (event: MapPointerEvent) => handle(event);
    map.on('click', listener);
    return () => {
      map.off('click', listener);
    };
  }, [map, enabled]);
}

/** Highlights a 2GIS map object (by the id from `useMapTap`) while mounted / until it changes. */
export function useMapObjectHighlight(objectId: string | null | undefined): void {
  const { map } = useMap();

  useEffect(() => {
    if (!map || !objectId) return;
    map.setSelectedObjects([objectId]);
    return () => {
      map.setSelectedObjects([]);
    };
  }, [map, objectId]);
}

const AT_PARAM = 'at';
const OBJECT_PARAM = 'obj';
const COORDINATE_DIGITS = 6;

/** `<lat>,<lng>` from a URL parameter; `null` when absent or malformed. */
export function parsePoint(raw: string | null): LatLng | null {
  if (!raw) return null;
  const [lat, lng] = raw.split(',').map(Number);
  if (lat === undefined || lng === undefined || !Number.isFinite(lat) || !Number.isFinite(lng))
    return null;
  return { lat, lng };
}

/**
 * The `?at=<lat>,<lng>&obj=<2gis id>` URL state: a tapped spot (any point or 2GIS object)
 * shown in the spot sheet on top of the current section.
 */
export function useSpotParam() {
  const [searchParams, setSearchParams] = useSearchParams();
  const at = searchParams.get(AT_PARAM);
  const objectId = searchParams.get(OBJECT_PARAM) ?? undefined;
  const point = parsePoint(at);
  const lat = point?.lat;
  const lng = point?.lng;

  const openSpot = useCallback(
    (tap: MapTap) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('place');
        next.delete('area');
        next.delete('stack');
        next.set(
          AT_PARAM,
          `${tap.lat.toFixed(COORDINATE_DIGITS)},${tap.lng.toFixed(COORDINATE_DIGITS)}`,
        );
        if (tap.objectId) next.set(OBJECT_PARAM, tap.objectId);
        else next.delete(OBJECT_PARAM);
        return next;
      });
    },
    [setSearchParams],
  );

  const closeSpot = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete(AT_PARAM);
      next.delete(OBJECT_PARAM);
      return next;
    });
  }, [setSearchParams]);

  const spot: MapTap | null =
    lat !== undefined && lng !== undefined ? { lat, lng, objectId } : null;
  return { spot, openSpot, closeSpot };
}
