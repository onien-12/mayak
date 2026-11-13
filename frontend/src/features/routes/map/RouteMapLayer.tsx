import { useMemo } from 'react';

import { MapHtmlMarker, MapRoute, useMapViewport } from '@/features/map';
import type { PathPoint } from '@/shared/api';

import type { NumberedStop } from '../lib/stops';
import { spreadPins } from './spreadPins';
import { STOP_PIN_SIZE, StopPin } from './StopPin';

interface RouteMapLayerProps {
  path: readonly PathPoint[];
  stops: readonly NumberedStop[];
  activePosition?: number | null;
  onStopClick?: (position: number) => void;
  /** Fit the camera to the line when it changes. */
  fit?: boolean;
}

/**
 * A published route on the map: the progressively drawn line and numbered stops by kind.
 * Stops too close to tell apart at the current zoom stand side by side.
 */
export function RouteMapLayer({
  path,
  stops,
  activePosition = null,
  onStopClick,
  fit = true,
}: RouteMapLayerProps) {
  const zoom = useMapViewport()?.zoom;
  const pins = useMemo(
    () =>
      spreadPins(
        stops.map(({ stop }) => stop),
        zoom,
        STOP_PIN_SIZE,
      ),
    [stops, zoom],
  );

  return (
    <>
      <MapRoute path={path} fit={fit} />
      {stops.map(({ stop, number }, index) => {
        const active = stop.position === activePosition;
        const pin = pins[index];
        return (
          <MapHtmlMarker
            key={stop.position}
            position={pin?.position ?? stop}
            anchor={[STOP_PIN_SIZE / 2 - (pin?.dx ?? 0), STOP_PIN_SIZE / 2]}
            zIndex={active ? 45 : 35}
          >
            <button
              type="button"
              aria-label={`Точка ${number}: ${stop.title}`}
              onClick={() => onStopClick?.(stop.position)}
              className="block rounded-full"
            >
              <StopPin number={number} kind={stop.kind} active={active} />
            </button>
          </MapHtmlMarker>
        );
      })}
    </>
  );
}
