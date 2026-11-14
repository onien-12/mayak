import {
  CircleDashed,
  GripVertical,
  Image as ImageIcon,
  Lightbulb,
  ScrollText,
  X,
} from 'lucide-react';
import { Reorder, useDragControls } from 'motion/react';
import { useMemo } from 'react';

import { cn } from '@/shared/lib/cn';
import { TONES } from '@/shared/lib/tones';
import { IconButton, SPRING } from '@/shared/ui';

import { CONDITION_META } from '../lib/meta';
import { removeStageWithUndo } from './actions';
import { pointOf, type DraftStage } from './model';
import { useQuestEditorStore } from './store';

function StageRow({
  stage,
  number,
  problem,
}: {
  stage: DraftStage;
  number: number;
  problem: boolean;
}) {
  const controls = useDragControls();
  const openStage = useQuestEditorStore((state) => state.openStage);
  const condition = CONDITION_META[stage.condition];

  return (
    <Reorder.Item
      value={stage.id}
      dragListener={false}
      dragControls={controls}
      layout="position"
      transition={SPRING.layout}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      whileDrag={{ scale: 1.03, boxShadow: 'var(--shadow-float)', zIndex: 20 }}
      className={cn(
        'relative flex items-center gap-1 rounded-card border bg-surface py-1.5 pr-1',
        problem ? 'border-danger/60 bg-danger-soft/40' : 'border-line/80',
      )}
    >
      <button
        type="button"
        aria-label="Перетащите, чтобы поменять порядок"
        onPointerDown={(event) => controls.start(event)}
        className="flex h-11 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-control text-ink-faint active:cursor-grabbing active:text-ink"
      >
        <GripVertical size={18} aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => openStage(stage.id)}
        className="flex min-w-0 flex-1 items-center gap-3 py-1 text-left"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-event text-sm font-semibold text-white tabular-nums">
          {number}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold text-ink">
            {stage.title.trim() || `Этап ${number}`}
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-xs">
            <span
              className={cn(
                'flex shrink-0 items-center gap-1 font-medium',
                TONES[condition.tone].text,
              )}
            >
              <condition.icon size={12} aria-hidden />
              {condition.label}
            </span>
            {stage.riddle.trim() ? (
              <ScrollText
                size={12}
                aria-label="Загадка написана"
                className="shrink-0 text-ink-soft"
              />
            ) : null}
            {stage.photo && (
              <ImageIcon size={12} aria-label="Есть фото" className="shrink-0 text-ink-soft" />
            )}
            {stage.hint.trim() && (
              <Lightbulb
                size={12}
                aria-label="Есть подсказка"
                className="shrink-0 text-warning-ink"
              />
            )}
            {stage.zone === 'circle' && (
              <CircleDashed
                size={12}
                aria-label="Круг на карте"
                className="shrink-0 text-ink-soft"
              />
            )}
            {!pointOf(stage) ? (
              <span className="truncate text-danger-ink">· не на карте</span>
            ) : problem ? (
              <span className="truncate text-danger-ink">· допишите этап</span>
            ) : (
              !stage.riddle.trim() && (
                <span className="truncate text-brand">· напишите загадку</span>
              )
            )}
          </span>
        </span>
      </button>
      <IconButton
        icon={X}
        label={`Удалить этап ${number}`}
        onClick={() => removeStageWithUndo(stage.id)}
      />
    </Reorder.Item>
  );
}

/** «Все этапы» in playing order: drag by the handle to reorder, tap to open, ✕ to delete. */
export function StageList() {
  const stages = useQuestEditorStore((state) => state.draft.stages);
  const problems = useQuestEditorStore((state) => state.errors.stage);
  const reorder = useQuestEditorStore((state) => state.reorder);
  const ids = useMemo(() => stages.map((stage) => stage.id), [stages]);

  return (
    <Reorder.Group axis="y" values={ids} onReorder={reorder} className="flex flex-col gap-1.5">
      {stages.map((stage, index) => (
        <StageRow
          key={stage.id}
          stage={stage}
          number={index + 1}
          problem={Boolean(
            problems?.[stage.id] && Object.keys(problems[stage.id] ?? {}).length > 0,
          )}
        />
      ))}
    </Reorder.Group>
  );
}
