import { ArrowRight, Flag, Hand, ListOrdered, Plus, X } from 'lucide-react';
import type { ReactNode } from 'react';

import { useIsDesktop } from '@/shared/hooks';
import { plural, pluralize } from '@/shared/lib/format';
import { Banner, Button, MapTopBar, PanelLayout, toast, usePanelStore } from '@/shared/ui';

import { QUEST_PLURALS } from '../lib/meta';
import { finishStages } from './actions';
import { filledStages, MAX_STAGES, MIN_STAGES } from './model';
import { StageList } from './StageList';
import { StagePage } from './StagePage';
import { StartPrompt } from './StartPrompt';
import { useQuestEditorStore } from './store';

interface StagesStepProps {
  title: string;
  onClose: () => void;
  notice?: ReactNode;
}

/** «Все этапы»: the whole quest at a glance — reorder, delete, open any stage, add one. */
function StagesOverview({ title, onClose, notice }: StagesStepProps) {
  const isDesktop = useIsDesktop();
  const stages = useQuestEditorStore((state) => state.draft.stages);
  const start = useQuestEditorStore((state) => state.draft.start);
  const tool = useQuestEditorStore((state) => state.tool);
  const errors = useQuestEditorStore((state) => state.errors);
  const missing = Math.max(0, MIN_STAGES - filledStages(stages).length);

  const add = () => {
    if (useQuestEditorStore.getState().appendStage() === null) {
      toast.info(`В квесте может быть до ${MAX_STAGES} этапов`);
      return;
    }
    const panel = usePanelStore.getState();
    if (panel.snap === 'full') panel.setSnap('half');
  };
  const markStart = () => {
    useQuestEditorStore.getState().setTool('start');
    usePanelStore.getState().showMap();
  };
  const startPrompt = tool === 'start' && <StartPrompt />;

  return (
    <>
      {!isDesktop && (
        <MapTopBar extra={startPrompt ? <div className="px-3">{startPrompt}</div> : undefined}>
          <p className="flex h-11 items-center gap-2 rounded-full bg-surface/95 px-4 text-sm font-medium text-ink shadow-float">
            <ListOrdered size={16} aria-hidden className="shrink-0 text-event" />
            Все этапы квеста
          </p>
        </MapTopBar>
      )}
      <PanelLayout
        title={title}
        subtitle={`Все этапы · ${pluralize(stages.length, QUEST_PLURALS.stage)}`}
        onBack={onClose}
        backLabel="Закрыть редактор"
        toolbar={isDesktop && startPrompt}
        footer={
          <div className="flex gap-2">
            <Button
              size="lg"
              icon={Plus}
              variant={missing > 0 ? 'primary' : 'secondary'}
              onClick={add}
              className="flex-1"
            >
              Добавить этап
            </Button>
            <Button
              size="lg"
              iconRight={ArrowRight}
              variant={missing > 0 ? 'secondary' : 'primary'}
              disabled={missing > 0}
              onClick={finishStages}
              className="flex-1"
            >
              {missing > 0 ? `Ещё ${missing} ${plural(missing, QUEST_PLURALS.stage)}` : 'Далее'}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {notice}
          {errors.stages && (
            <Banner tone="danger" icon={X}>
              {errors.stages}
            </Banner>
          )}
          {stages.length > 0 ? (
            <StageList />
          ) : (
            <p className="text-sm text-ink-soft">Этапов пока нет — нажмите «Добавить этап».</p>
          )}
          {stages.length > 1 && (
            <p className="flex items-center gap-2 text-sm text-ink-soft">
              <Hand size={16} aria-hidden className="shrink-0 text-brand" />
              Перетаскивайте строки за ручку, чтобы поменять порядок; нажмите на этап, чтобы открыть
              его.
            </p>
          )}
          <div className="flex items-center gap-2 text-sm text-ink-soft">
            <Flag size={16} aria-hidden className="shrink-0 text-ink" />
            <span className="min-w-0 flex-1">
              {start ? 'Старт отмечен — его можно перетащить.' : 'Старт ещё не отмечен.'}
            </span>
            {tool !== 'start' && (
              <Button size="sm" variant="ghost" onClick={markStart}>
                {start ? 'Переставить' : 'Отметить старт'}
              </Button>
            )}
          </div>
        </div>
      </PanelLayout>
    </>
  );
}

/** Step 1: one stage page at a time while creating; «Все этапы» for the overview. */
export function StagesStep(props: StagesStepProps) {
  const view = useQuestEditorStore((state) => state.view);
  return view === 'stage' ? <StagePage {...props} /> : <StagesOverview {...props} />;
}
