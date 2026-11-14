import { ListOrdered } from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui';

import { isEmptyStage, stageErrors } from './model';
import { useQuestEditorStore } from './store';

/**
 * «Этап 2 из 3» with a numbered dot per stage — filled ones are solid, the open one has a ring —
 * to jump to any of them, and «Все этапы» for the overview.
 */
export function StageStepper() {
  const stages = useQuestEditorStore((state) => state.draft.stages);
  const currentId = useQuestEditorStore((state) => state.currentId);
  const { openStage, openOverview } = useQuestEditorStore.getState();
  const index = stages.findIndex((stage) => stage.id === currentId);

  return (
    <div className="flex items-center gap-2">
      <nav
        aria-label="Этапы квеста"
        className="no-scrollbar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-1"
      >
        {stages.map((stage, position) => {
          const current = stage.id === currentId;
          const complete = Object.keys(stageErrors(stage)).length === 0;
          const blank = isEmptyStage(stage);
          return (
            <button
              key={stage.id}
              type="button"
              aria-current={current ? 'step' : undefined}
              aria-label={`Этап ${position + 1}${complete ? '' : blank ? ', пустой' : ', не дописан'}`}
              onClick={() => openStage(stage.id)}
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums transition-[background-color,box-shadow] duration-150',
                complete
                  ? 'bg-event text-white'
                  : 'border-2 border-dashed border-event/50 text-event',
                current && 'ring-3 ring-beam',
              )}
            >
              {position + 1}
            </button>
          );
        })}
      </nav>
      <Button size="sm" variant="ghost" icon={ListOrdered} onClick={openOverview}>
        Все этапы
      </Button>
      <span className="sr-only" aria-live="polite">
        {index >= 0 && `Этап ${index + 1} из ${stages.length}`}
      </span>
    </div>
  );
}
