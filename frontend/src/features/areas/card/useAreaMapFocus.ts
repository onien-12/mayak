import { useEffect, useEffectEvent } from 'react';

import { useMapActions, useMapExtraPlaces, useMapUnfoldArea } from '@/features/map';
import type { AreaDetail } from '@/shared/api';
import { polygonBounds } from '@/shared/lib/polygon';

import { useMapFocusArea } from '../map/areaLayerStore';

const FIT_MAX_ZOOM = 17;

/**
 * While the area card is open: its territory and selected pill, its places unfolded as
 * ordinary pins, and the camera fitted to the territory above the sheet (once per area).
 */
export function useAreaMapFocus(area: AreaDetail | undefined): void {
  const { fitBounds, ready } = useMapActions();
  useMapFocusArea(area);
  useMapUnfoldArea(area?.id);
  useMapExtraPlaces(area?.places);

  const fit = useEffectEvent(() => {
    if (area) fitBounds(polygonBounds(area.geometry), { maxZoom: FIT_MAX_ZOOM, padding: 40 });
  });
  const id = area?.id;

  useEffect(() => {
    if (ready && id !== undefined) fit();
  }, [ready, id]);
}
