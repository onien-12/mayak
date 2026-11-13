import { useMemo } from 'react';

import {
  MapHtmlMarker,
  MapPolygon,
  useAreaParam,
  useMapFolded,
  useMapMarkerPoints,
  useMapPicking,
  useMapViewport,
} from '@/features/map';
import type { AreaCard } from '@/shared/api';
import { cn } from '@/shared/lib/cn';

import { useAreaEditor } from '../editor/areaEditorStore';
import { shownInterest } from '../lib/interest';
import { layoutAreaPins } from '../lib/pinLayout';
import { useAreaLayer } from './areaLayerStore';
import { AreaPin } from './AreaPin';

/** From this zoom every visible territory gets a faint tint («places within territories»). */
export const TERRITORY_TINT_ZOOM = 14;
const PIN_Z_INDEX = 50;
const SELECTED_PIN_Z_INDEX = 58;

/** The section's areas, the recommended ones and the open one, without duplicates. */
function useLayerAreas(): { areas: readonly AreaCard[]; recommendedIds: ReadonlySet<number> } {
  const sectionAreas = useAreaLayer((state) => state.sectionAreas);
  const focusArea = useAreaLayer((state) => state.focusArea);
  const recommended = useAreaLayer((state) => state.recommended);
  return useMemo(() => {
    const recommendedIds = new Set(recommended.map((area) => area.id));
    if (!focusArea && recommended.length === 0) return { areas: sectionAreas, recommendedIds };
    const merged = new Map(sectionAreas.map((area) => [area.id, area]));
    for (const area of recommended) if (!merged.has(area.id)) merged.set(area.id, area);
    if (focusArea) {
      merged.delete(focusArea.id);
      merged.set(focusArea.id, focusArea);
    }
    return { areas: [...merged.values()], recommendedIds };
  }, [sectionAreas, focusArea, recommended]);
}

/**
 * The area layer, rendered once by the app shell: interest-tinted pills (the main thing
 * visible when zoomed out; tinted by the personal interest when there is one), faint
 * territories from `TERRITORY_TINT_ZOOM`, and the open area's territory with a crisp outline.
 * Recommended areas («Для вас») keep a labelled pill first and carry a quiet accent.
 */
export function AreaLayer() {
  const { areas, recommendedIds } = useLayerAreas();
  const { areaId, openArea } = useAreaParam();
  const folded = useMapFolded();
  const picking = useMapPicking();
  const editing = useAreaEditor((state) => state.session !== null);
  const viewport = useMapViewport();
  const markers = useMapMarkerPoints();
  const zoom = viewport?.zoom;
  const bounds = viewport?.bounds ?? null;
  const layout = useMemo(
    () =>
      zoom === undefined
        ? null
        : layoutAreaPins(areas, { zoom, markers, bounds, priority: recommendedIds }),
    [areas, zoom, markers, bounds, recommendedIds],
  );

  return (
    <>
      {areas.map((area) => {
        const selected = area.id === areaId && !editing;
        const { tier } = shownInterest(area);
        return (
          <MapPolygon
            key={`${area.id}:${selected ? 'open' : 'tint'}`}
            geometry={area.geometry}
            color={tier.color}
            fillOpacity={selected ? 0.16 : 0.07}
            strokeOpacity={selected ? 0.95 : 0.3}
            strokeWidth={selected ? 2.5 : 1}
            minZoom={selected ? undefined : TERRITORY_TINT_ZOOM}
            zIndex={selected ? 3 : 1}
          />
        );
      })}
      {!editing &&
        areas.map((area) => {
          const selected = area.id === areaId;
          const placement = selected || !folded || !layout ? null : layout.get(area.id);
          if (placement === undefined) return null;
          const variant = placement?.variant ?? 'label';
          return (
            <MapHtmlMarker
              key={area.id}
              position={area}
              anchor={[0, 0]}
              zIndex={selected ? SELECTED_PIN_Z_INDEX : PIN_Z_INDEX + (variant === 'full' ? 1 : 0)}
            >
              <div className={cn(picking && 'pointer-events-none opacity-40')}>
                <AreaPin
                  area={area}
                  variant={variant}
                  selected={selected}
                  recommended={recommendedIds.has(area.id)}
                  compact={placement?.compact}
                  dx={placement?.dx}
                  dy={placement?.dy}
                  onOpen={openArea}
                />
              </div>
            </MapHtmlMarker>
          );
        })}
    </>
  );
}
