import { useReducedMotion } from 'motion/react';
import { createElement, useEffect, useMemo } from 'react';

import type { PathPoint, StopKind } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { boundsOfPoints, type LatLng } from '@/shared/lib/geo';
import { STOP_KIND_META } from '@/shared/lib/labels';

import { useMapActions } from './hooks';
import { useMap } from './mapContext';
import { MapHtmlMarker } from './MapHtmlMarker';

export interface MapRouteStop extends LatLng {
  /** Stable React key (stop position or id). */
  key: string | number;
  title?: string;
  /** `via` stops shape the line only: no marker, no number. Defaults to `poi`. */
  kind?: StopKind;
}

interface MapRouteProps {
  /** Line geometry, `[lng, lat][]` as returned by the API. */
  path: readonly PathPoint[];
  /** Waypoints in visiting order. */
  stops?: readonly MapRouteStop[];
  /** `number`: 1, 2, 3… (default); `icon`: the glyph of the stop kind. */
  stopMarkers?: 'number' | 'icon';
  color?: string;
  /** Fit the camera to the route when the geometry changes. */
  fit?: boolean;
  activeStopKey?: string | number | null;
  onStopClick?: (key: string | number) => void;
}

const ROUTE_COLOR = '#0B2A4A';
const STOP_SIZE = 30;
const DRAW_MS = 550;
const DRAW_STEPS = 14;

/**
 * Route polyline with stop markers. The line draws itself progressively when the geometry
 * changes (instantly with reduced motion).
 */
export function MapRoute({
  path,
  stops = [],
  stopMarkers = 'number',
  color = ROUTE_COLOR,
  fit = true,
  activeStopKey,
  onStopClick,
}: MapRouteProps) {
  const { map, api } = useMap();
  const { fitBounds } = useMapActions();
  const reducedMotion = useReducedMotion();
  const pathKey = useMemo(() => JSON.stringify(path), [path]);

  useEffect(() => {
    if (!map || !api) return;
    const coordinates = JSON.parse(pathKey) as PathPoint[];
    if (coordinates.length < 2) return;

    let line: InstanceType<typeof api.Polyline> | null = null;
    let timer = 0;
    const draw = (count: number) => {
      line?.destroy();
      line = new api.Polyline(map, {
        coordinates: coordinates.slice(0, Math.max(2, count)),
        width: 5,
        color,
        width2: 9,
        color2: '#ffffff',
        zIndex: 2,
        zIndex2: 1,
        interactive: false,
      });
    };

    if (reducedMotion) {
      draw(coordinates.length);
    } else {
      let step = 0;
      const tick = () => {
        step += 1;
        draw(Math.ceil((coordinates.length * step) / DRAW_STEPS));
        if (step < DRAW_STEPS) timer = window.setTimeout(tick, DRAW_MS / DRAW_STEPS);
      };
      tick();
    }

    return () => {
      window.clearTimeout(timer);
      line?.destroy();
    };
  }, [map, api, pathKey, color, reducedMotion]);

  useEffect(() => {
    if (!fit) return;
    const coordinates = JSON.parse(pathKey) as PathPoint[];
    const bounds = boundsOfPoints(coordinates.map(([lng, lat]) => ({ lat, lng })));
    if (bounds) fitBounds(bounds);
  }, [fit, pathKey, fitBounds]);

  const visible = stops.filter((stop) => stop.kind !== 'via');

  return visible.map((stop, index) => {
    const active = stop.key === activeStopKey;
    return (
      <MapHtmlMarker
        key={stop.key}
        position={stop}
        anchor={[STOP_SIZE / 2, STOP_SIZE / 2]}
        zIndex={active ? 40 : 30}
        passive={!onStopClick}
      >
        <button
          type="button"
          title={stop.title}
          tabIndex={onStopClick ? 0 : -1}
          onClick={() => onStopClick?.(stop.key)}
          style={{ width: STOP_SIZE, height: STOP_SIZE }}
          className={cn(
            'flex items-center justify-center rounded-full border-2 border-white text-xs font-semibold shadow-pin transition-[transform,background-color] duration-150',
            active ? 'scale-125 bg-beam text-ink' : 'bg-brand text-white',
            stop.kind === 'danger' && !active && 'bg-danger',
            !onStopClick && 'pointer-events-none',
          )}
        >
          {stopMarkers === 'icon'
            ? createElement(STOP_KIND_META[stop.kind ?? 'poi'].icon, {
                size: 15,
                'aria-hidden': true,
              })
            : index + 1}
        </button>
      </MapHtmlMarker>
    );
  });
}
