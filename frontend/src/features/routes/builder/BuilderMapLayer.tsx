import { useEffect, useRef } from 'react';

import { MapRoute, useMapActions, useMapPlaces, useMapTap, type MapTap } from '@/features/map';
import type { PathPoint, PlaceCard } from '@/shared/api';
import { boundsOfPoints } from '@/shared/lib/geo';
import { toast } from '@/shared/ui';

import { DraggableMarker } from '../map/DraggableMarker';
import { STOP_PIN_SIZE, StopPin, VIA_DOT_SIZE, ViaDot } from '../map/StopPin';
import { addPlaceStop, FULL_ROUTE_MESSAGE, removeWithUndo } from './actions';
import { isVia, stopNumber, stopTitle } from './model';
import { useBuilderStore } from './store';
import { usePlaceCandidates } from './usePlaceCandidates';

const NO_PLACES: PlaceCard[] = [];

/**
 * The builder on the map: the live line, draggable numbered stops and shaping dots, taps
 * that add points (by the current tool) and place pins to pick from.
 */
export function BuilderMapLayer({
  path,
  interactive,
}: {
  path: PathPoint[];
  interactive: boolean;
}) {
  const stops = useBuilderStore((state) => state.draft.stops);
  const tool = useBuilderStore((state) => state.tool);
  const selectedId = useBuilderStore((state) => state.selectedId);
  const editingId = useBuilderStore((state) => state.editingId);
  const { fitBounds, ready } = useMapActions();
  const framed = useRef(false);
  const choosingPlaces = interactive && tool === 'places';
  const candidates = usePlaceCandidates(choosingPlaces);

  useMapPlaces(choosingPlaces ? candidates.data : NO_PLACES, { onSelect: addPlaceStop });

  // Captured for the whole session: a tap in the builder never opens the spot sheet.
  useMapTap(
    (tap: MapTap) => {
      const store = useBuilderStore.getState();
      if (!interactive) return;
      if (store.tool === 'places') {
        toast.info('Выберите место на карте — или переключитесь на «Точку»');
        return;
      }
      const id =
        store.tool === 'via'
          ? store.addVia(tap)
          : store.addStop(tap, { objectId: tap.objectId ?? null });
      if (id === null) toast.info(FULL_ROUTE_MESSAGE);
    },
    true,
    { capture: true },
  );

  useEffect(() => {
    if (framed.current || !ready) return;
    framed.current = true;
    const bounds = boundsOfPoints(stops);
    if (bounds && stops.length > 1) fitBounds(bounds);
  }, [ready, stops, fitBounds]);

  const { updateStop, openEditor } = useBuilderStore.getState();

  return (
    <>
      {path.length > 1 && <MapRoute path={path} fit={false} />}
      {stops.map((stop) => {
        if (isVia(stop)) {
          return (
            <DraggableMarker
              key={stop.id}
              position={stop}
              anchor={[VIA_DOT_SIZE / 2, VIA_DOT_SIZE / 2]}
              zIndex={31}
              label="Промежуточная точка: перетащите или нажмите, чтобы удалить"
              onTap={() => removeWithUndo(stop.id)}
              onDragEnd={(point) => updateStop(stop.id, point)}
            >
              <ViaDot />
            </DraggableMarker>
          );
        }
        const number = stopNumber(stops, stop.id);
        const active = stop.id === selectedId || stop.id === editingId;
        return (
          <DraggableMarker
            key={stop.id}
            position={stop}
            anchor={[STOP_PIN_SIZE / 2, STOP_PIN_SIZE / 2]}
            zIndex={active ? 46 : 36}
            label={`${stopTitle(stop, number)}: перетащите или нажмите, чтобы описать`}
            onTap={() => openEditor(stop.id)}
            onDragEnd={(point) => updateStop(stop.id, point)}
          >
            <StopPin number={number} kind={stop.kind} active={active} />
          </DraggableMarker>
        );
      })}
    </>
  );
}
