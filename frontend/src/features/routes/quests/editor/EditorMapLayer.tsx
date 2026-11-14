import { Flag } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef } from 'react';

import { MapCircle, MapRoute, useMapActions, useMapTap, type MapTap } from '@/features/map';
import { cn } from '@/shared/lib/cn';
import { boundsOfPoints } from '@/shared/lib/geo';
import { SPRING, toast } from '@/shared/ui';

import { DraggableMarker } from '../../map/DraggableMarker';
import { MAX_STAGES, pointOf } from './model';
import { useQuestEditorStore } from './store';

const PIN = 32;
const STAGE_COLOR = '#7C5CFC';
const ZONE_COLOR = '#E8A317';

function StagePin({ number, active }: { number: number; active: boolean }) {
  return (
    <motion.span
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: active ? 1.18 : 1, opacity: 1 }}
      transition={SPRING.pop}
      style={{ width: PIN, height: PIN }}
      className={cn(
        'flex items-center justify-center rounded-full border-2 border-white bg-event text-sm font-semibold text-white tabular-nums shadow-pin',
        active && 'ring-3 ring-beam',
      )}
    >
      {number}
    </motion.span>
  );
}

/**
 * The quest on the author's map: numbered stages in order (dragged to move, tapped to open), the
 * start flag, and for the open stage — highlighted — its arrival radius and search circle. A tap
 * on the map puts the open stage there while it waits for its point, adds a stage from the
 * overview, or sets the start with the «Старт» tool.
 */
export function EditorMapLayer({ interactive }: { interactive: boolean }) {
  const stages = useQuestEditorStore((state) => state.draft.stages);
  const start = useQuestEditorStore((state) => state.draft.start);
  const currentId = useQuestEditorStore((state) =>
    state.step === 'stages' && state.view === 'stage' ? state.currentId : null,
  );
  const { fitBounds, ready } = useMapActions();
  const framed = useRef(false);
  const current = stages.find((stage) => stage.id === currentId);
  const currentPoint = current ? pointOf(current) : null;

  useMapTap(
    (tap: MapTap) => {
      if (!interactive) return;
      const store = useQuestEditorStore.getState();
      const point = { lat: tap.lat, lng: tap.lng };
      if (store.tool === 'start') {
        store.setMeta({ start: point });
        store.setTool('stage');
        toast.success('Старт отмечен — его можно перетащить');
        return;
      }
      if (store.step !== 'stages') return;
      if (store.view === 'overview') {
        if (store.addStageAt(point, tap.objectId ?? null) === null) {
          toast.info(`В квесте может быть до ${MAX_STAGES} этапов`);
        }
        return;
      }
      const open = store.draft.stages.find((stage) => stage.id === store.currentId);
      if (!open) return;
      if (!pointOf(open)) store.updateStage(open.id, { ...point, objectId: tap.objectId ?? null });
      else if (store.replacing) store.updateStage(open.id, point);
    },
    true,
    { capture: true },
  );

  useEffect(() => {
    if (framed.current || !ready) return;
    framed.current = true;
    const placed = stages.flatMap((stage) => pointOf(stage) ?? []);
    const bounds = boundsOfPoints([...(start ? [start] : []), ...placed]);
    if (bounds && placed.length > 0) fitBounds(bounds, { maxZoom: 16 });
  }, [ready, stages, start, fitBounds]);

  const { updateStage, openStage, setMeta } = useQuestEditorStore.getState();
  const placedStages = stages.flatMap((stage, index) => {
    const point = pointOf(stage);
    return point ? [{ stage, point, number: index + 1 }] : [];
  });
  const path = placedStages.map(({ point }) => [point.lng, point.lat] as [number, number]);

  return (
    <>
      {path.length > 1 && <MapRoute path={path} color={STAGE_COLOR} fit={false} />}
      {current && currentPoint && (
        <>
          <MapCircle center={currentPoint} radiusM={current.radiusM} color={STAGE_COLOR} />
          {current.zone === 'circle' && (
            <MapCircle center={currentPoint} radiusM={current.zoneRadiusM} color={ZONE_COLOR} />
          )}
        </>
      )}
      {start && (
        <DraggableMarker
          position={start}
          anchor={[PIN / 2, PIN / 2]}
          zIndex={40}
          label="Старт квеста: перетащите, чтобы сдвинуть"
          onTap={() => useQuestEditorStore.getState().setStep('details')}
          onDragEnd={(point) => setMeta({ start: point })}
        >
          <span
            style={{ width: PIN, height: PIN }}
            className="flex items-center justify-center rounded-full border-2 border-white bg-ink text-white shadow-pin"
          >
            <Flag size={15} aria-hidden />
          </span>
        </DraggableMarker>
      )}
      {placedStages.map(({ stage, point, number }) => (
        <DraggableMarker
          key={stage.id}
          position={point}
          anchor={[PIN / 2, PIN / 2]}
          zIndex={stage.id === currentId ? 46 : 36}
          label={`Этап ${number}: перетащите или нажмите, чтобы открыть`}
          onTap={() => openStage(stage.id)}
          onDragEnd={(moved) => updateStage(stage.id, moved)}
        >
          <StagePin number={number} active={stage.id === currentId} />
        </DraggableMarker>
      ))}
    </>
  );
}
