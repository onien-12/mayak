import { Flag } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef } from 'react';

import { MapCircle, MapRoute, useMapActions, useMapTap, type MapTap } from '@/features/map';
import { cn } from '@/shared/lib/cn';
import { boundsOfPoints } from '@/shared/lib/geo';
import { SPRING, toast } from '@/shared/ui';

import { DraggableMarker } from '../../map/DraggableMarker';
import { MAX_STAGES } from './model';
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
 * The quest on the author's map: numbered stages in order (dragged to move, tapped to edit), the
 * start flag, and for the stage being edited its arrival radius and search circle. A tap on the
 * map adds a stage there, or moves the start with the «Старт» tool.
 */
export function EditorMapLayer({ interactive }: { interactive: boolean }) {
  const stages = useQuestEditorStore((state) => state.draft.stages);
  const start = useQuestEditorStore((state) => state.draft.start);
  const editingId = useQuestEditorStore((state) => state.editingId);
  const { fitBounds, ready } = useMapActions();
  const framed = useRef(false);
  const editing = stages.find((stage) => stage.id === editingId);

  useMapTap(
    (tap: MapTap) => {
      if (!interactive) return;
      const store = useQuestEditorStore.getState();
      if (store.tool === 'start') {
        store.setMeta({ start: { lat: tap.lat, lng: tap.lng } });
        store.setTool('stage');
        toast.success('Старт отмечен — теперь ставьте этапы');
        return;
      }
      if (store.addStage(tap, tap.objectId ?? null) === null) {
        toast.info(`В квесте может быть до ${MAX_STAGES} этапов`);
      }
    },
    true,
    { capture: true },
  );

  useEffect(() => {
    if (framed.current || !ready) return;
    framed.current = true;
    const bounds = boundsOfPoints([...(start ? [start] : []), ...stages]);
    if (bounds && stages.length > 0) fitBounds(bounds, { maxZoom: 16 });
  }, [ready, stages, start, fitBounds]);

  const { updateStage, openEditor, setMeta } = useQuestEditorStore.getState();
  const path = stages.map((stage) => [stage.lng, stage.lat] as [number, number]);

  return (
    <>
      {path.length > 1 && <MapRoute path={path} color={STAGE_COLOR} fit={false} />}
      {editing && (
        <>
          <MapCircle center={editing} radiusM={editing.radiusM} color={STAGE_COLOR} />
          {editing.zone === 'circle' && (
            <MapCircle center={editing} radiusM={editing.zoneRadiusM} color={ZONE_COLOR} />
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
      {stages.map((stage, index) => (
        <DraggableMarker
          key={stage.id}
          position={stage}
          anchor={[PIN / 2, PIN / 2]}
          zIndex={stage.id === editingId ? 46 : 36}
          label={`Этап ${index + 1}: перетащите или нажмите, чтобы описать`}
          onTap={() => openEditor(stage.id)}
          onDragEnd={(point) => updateStage(stage.id, point)}
        >
          <StagePin number={index + 1} active={stage.id === editingId} />
        </DraggableMarker>
      ))}
    </>
  );
}
