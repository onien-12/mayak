import { useEffect } from 'react';

import { toLngLat, type LatLng } from '@/shared/lib/geo';

import { useMap } from './mapContext';

interface MapCircleProps {
  center: LatLng;
  radiusM: number;
  /** Hex colour of the outline; the fill is the same colour at ~14 % opacity. */
  color?: string;
}

const ISSUE_COLOR = '#E5484D';

/** Translucent area circle in metres — e.g. the radius affected by a utility outage. */
export function MapCircle({ center, radiusM, color = ISSUE_COLOR }: MapCircleProps) {
  const { map, api } = useMap();
  const { lat, lng } = center;

  useEffect(() => {
    if (!map || !api) return;
    const circle = new api.Circle(map, {
      coordinates: toLngLat({ lat, lng }),
      radius: radiusM,
      color: `${color}24`,
      strokeColor: `${color}B3`,
      strokeWidth: 2,
      interactive: false,
      zIndex: 1,
    });
    return () => circle.destroy();
  }, [map, api, lat, lng, radiusM, color]);

  return null;
}
