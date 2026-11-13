import { MousePointerClick, X } from 'lucide-react';
import { AnimatePresence, motion, Reorder } from 'motion/react';
import { useMemo } from 'react';

import { IconButton, riseVariants, usePanelStore } from '@/shared/ui';

import { legMinutes } from '../lib/stops';
import { isVia, legsToVisibleStops, stopNumber } from './model';
import { removeWithUndo } from './actions';
import { useBuilderStore } from './store';
import { StopRow, type StopLeg } from './StopRow';
import type { RoutePreviewState } from './useRoutePreview';

function InsertHint({ onCancel }: { onCancel: () => void }) {
  return (
    <motion.li
      variants={riseVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="mb-2 flex items-center gap-2 rounded-card border-2 border-dashed border-brand/50 bg-brand-soft px-3 py-2 text-sm text-brand"
    >
      <MousePointerClick size={18} aria-hidden className="shrink-0" />
      <span className="flex-1">Нажмите на карту — новая точка встанет сюда</span>
      <IconButton icon={X} label="Не вставлять" size="sm" onClick={onCancel} />
    </motion.li>
  );
}

/**
 * Ordered stops with drag-and-drop (handle only — the list still scrolls by touch),
 * legs between visible stops from the live preview, insert-between and undo-able removal.
 */
export function StopList({ preview }: { preview: RoutePreviewState }) {
  const stops = useBuilderStore((state) => state.draft.stops);
  const selectedId = useBuilderStore((state) => state.selectedId);
  const insertAt = useBuilderStore((state) => state.insertAt);
  const { reorder, openEditor, setInsertAt } = useBuilderStore.getState();
  const showMap = usePanelStore((state) => state.showMap);
  const ids = useMemo(() => stops.map((stop) => stop.id), [stops]);

  const legs = useMemo(() => {
    const meters = legsToVisibleStops(stops, preview.legs);
    const result = new Map<string, StopLeg>();
    for (const [id, value] of meters) {
      result.set(id, {
        meters: value,
        minutes:
          preview.travelMin === null
            ? null
            : legMinutes(value, preview.distanceM, preview.travelMin),
        estimate: preview.estimate,
      });
    }
    return result;
  }, [stops, preview.legs, preview.travelMin, preview.distanceM, preview.estimate]);

  const insertBefore = (index: number) => {
    setInsertAt(index);
    showMap();
  };

  return (
    <Reorder.Group axis="y" values={ids} onReorder={reorder} className="flex flex-col gap-1.5">
      <AnimatePresence initial={false}>
        {stops.flatMap((stop, index) => [
          insertAt === index ? (
            <InsertHint key="insert-hint" onCancel={() => setInsertAt(null)} />
          ) : null,
          <StopRow
            key={stop.id}
            stop={stop}
            number={stopNumber(stops, stop.id)}
            leg={legs.get(stop.id)}
            selected={stop.id === selectedId}
            onOpen={() => openEditor(stop.id)}
            onRemove={() => removeWithUndo(stop.id)}
            onInsertBefore={isVia(stop) ? undefined : () => insertBefore(index)}
          />,
        ])}
      </AnimatePresence>
    </Reorder.Group>
  );
}
