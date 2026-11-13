import { useEffect, useEffectEvent } from 'react';

import { MapCircle, useMapActions, useWatchUserLocation } from '@/features/map';
import type { QuestRun } from '@/shared/api';
import { boundsOfPoints } from '@/shared/lib/geo';

import { PassedMarker, StartMarker } from '../QuestMarkers';

const ZONE_COLOR = '#7C5CFC';
const METERS_PER_DEGREE = 111_320;

/** The game on the map: the start, the places found, the search circle and the player. */
export function RunMapLayer({ run }: { run: QuestRun }) {
  const { fitBounds, flyTo, ready } = useMapActions();
  const zone = run.current?.zone ?? null;
  const playing = run.current !== null;
  useWatchUserLocation(playing);

  const frame = useEffectEvent(() => {
    if (zone) {
      const dLat = zone.radius_m / METERS_PER_DEGREE;
      const dLng = dLat / Math.cos((zone.lat * Math.PI) / 180);
      fitBounds({
        minLat: zone.lat - dLat,
        maxLat: zone.lat + dLat,
        minLng: zone.lng - dLng,
        maxLng: zone.lng + dLng,
      });
      return;
    }
    if (!playing) {
      const bounds = boundsOfPoints([run.start, ...run.passed]);
      if (bounds) fitBounds(bounds, { maxZoom: 16 });
      return;
    }
    flyTo(run.passed.at(-1) ?? run.start, { minZoom: 15 });
  });

  // Re-frame when the stage changes, not on every poll of a team run.
  const stage = run.current?.position ?? 0;
  useEffect(() => {
    if (ready) frame();
  }, [ready, stage]);

  return (
    <>
      <StartMarker position={run.start} label={`Старт: ${run.start.title}`} />
      {run.passed.map((passed) => (
        <PassedMarker key={passed.position} position={passed} number={passed.position} />
      ))}
      {zone && <MapCircle center={zone} radiusM={zone.radius_m} color={ZONE_COLOR} />}
    </>
  );
}
