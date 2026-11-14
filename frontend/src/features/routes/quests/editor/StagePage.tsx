import { ArrowLeft, ArrowRight, Check, MapPinned, MousePointerClick, Trash2 } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';

import { useIsDesktop } from '@/shared/hooks';
import { Banner, Button, MapTopBar, PanelLayout, toast, usePanelStore } from '@/shared/ui';

import { useVisibleCenter } from '../../lib/visibleCenter';
import { PlacementPrompt } from '../../ui/PlacementPrompt';
import { checkStage, finishStages, removeStageWithUndo } from './actions';
import { filledStages, MAX_STAGES, MIN_STAGES, pointOf, type DraftStage } from './model';
import { StageForm } from './StageForm';
import { StageStepper } from './StageStepper';
import { StartPrompt } from './StartPrompt';
import { useQuestEditorStore } from './store';

/** Brings the first message of a failed check into view — inside the panel only, never the page. */
function showFirstError(): void {
  window.requestAnimationFrame(() => {
    const target = document.querySelector(
      '[data-stage-point-error], [data-sheet-scroll] [aria-invalid="true"]',
    );
    const area = target?.closest('[data-sheet-scroll]');
    if (!target || !area) return;
    const offset = target.getBoundingClientRect().top - area.getBoundingClientRect().top;
    area.scrollTo({ top: area.scrollTop + offset - area.clientHeight / 4, behavior: 'smooth' });
  });
}

/**
 * Phones: putting the stage on the map needs the map, so the sheet is at most half-open while
 * the stage waits for its point; once it is placed the sheet opens up for the form.
 */
function useSheetForPlacing(stageId: string, placing: boolean): void {
  const was = useRef({ stageId, placing });
  useEffect(() => {
    const panel = usePanelStore.getState();
    const before = was.current;
    was.current = { stageId, placing };
    if (placing && panel.snap === 'full') panel.setSnap('half');
    else if (!placing && before.stageId === stageId && before.placing) panel.setSnap('full');
  }, [stageId, placing]);
}

function PointLine({ stage, number }: { stage: DraftStage; number: number }) {
  const error = useQuestEditorStore((state) => state.errors.stage?.[stage.id]?.point);
  const replacing = useQuestEditorStore((state) => state.replacing);
  if (pointOf(stage)) {
    return (
      <div className="flex items-center gap-2 rounded-control bg-canvas py-1.5 pr-1.5 pl-3 text-sm text-ink-soft">
        <MapPinned size={16} aria-hidden className="shrink-0 text-event" />
        <span className="min-w-0 flex-1">Этап {number} на карте — метку можно перетащить</span>
        {!replacing && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => useQuestEditorStore.getState().setReplacing(true)}
          >
            Переставить
          </Button>
        )}
      </div>
    );
  }
  return (
    <div data-stage-point-error={error ? '' : undefined}>
      <Banner tone={error ? 'danger' : 'beam'} icon={MousePointerClick}>
        {error ?? `Сначала поставьте этап ${number} на карту — потом опишите его.`}
      </Banner>
    </div>
  );
}

interface StagePageProps {
  title: string;
  onClose: () => void;
  notice?: ReactNode;
}

/**
 * One stage, one page: put it on the map, write the riddle and how it is passed, then
 * «Следующий этап». «Назад» keeps everything; the dots jump between stages.
 */
export function StagePage({ title, onClose, notice }: StagePageProps) {
  const isDesktop = useIsDesktop();
  const stages = useQuestEditorStore((state) => state.draft.stages);
  const currentId = useQuestEditorStore((state) => state.currentId);
  const replacing = useQuestEditorStore((state) => state.replacing);
  const tool = useQuestEditorStore((state) => state.tool);
  const visibleCenter = useVisibleCenter();
  const index = Math.max(
    0,
    stages.findIndex((stage) => stage.id === currentId),
  );
  const stage = stages[index];
  const placing = Boolean(stage) && (!pointOf(stage as DraftStage) || replacing);
  useSheetForPlacing(stage?.id ?? '', placing);
  if (!stage) return null;

  const number = index + 1;
  const store = useQuestEditorStore.getState;
  const enough = filledStages(stages).length >= MIN_STAGES;

  const placeInCenter = () => {
    const others = stages.flatMap((item) => (item.id === stage.id ? [] : (pointOf(item) ?? [])));
    const point = visibleCenter(others);
    if (point) store().updateStage(stage.id, point);
  };
  const next = () => {
    if (!checkStage(stage.id)) {
      usePanelStore.getState().reveal();
      showFirstError();
      return;
    }
    const following = stages[index + 1];
    if (following) store().openStage(following.id);
    else if (store().appendStage() === null) {
      toast.info(`В квесте может быть до ${MAX_STAGES} этапов`);
    }
  };
  const back = () => {
    const previous = stages[index - 1];
    if (previous) store().openStage(previous.id);
  };

  const prompt =
    tool === 'start' ? (
      <StartPrompt />
    ) : (
      placing && (
        <PlacementPrompt
          text={
            replacing
              ? `Нажмите на карту — туда переедет этап ${number}`
              : `Нажмите на карту — там будет этап ${number}`
          }
          onCenter={placeInCenter}
          onCancel={replacing ? () => store().setReplacing(false) : undefined}
        />
      )
    );

  return (
    <>
      {!isDesktop && (
        <MapTopBar extra={prompt ? <div className="px-3">{prompt}</div> : undefined}>
          <p className="flex h-11 items-center gap-2 rounded-full bg-surface/95 px-4 text-sm font-medium text-ink shadow-float">
            <MapPinned size={16} aria-hidden className="shrink-0 text-event" />
            Этап {number} из {stages.length}
          </p>
        </MapTopBar>
      )}
      <PanelLayout
        title={`Этап ${number} из ${stages.length}`}
        subtitle={title}
        onBack={onClose}
        backLabel="Закрыть редактор"
        toolbar={
          <div className="flex flex-col gap-2">
            {isDesktop && prompt}
            <StageStepper />
          </div>
        }
        footer={
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Button
                size="lg"
                variant="secondary"
                icon={ArrowLeft}
                disabled={index === 0}
                onClick={back}
                aria-label="Назад, к предыдущему этапу"
              >
                Назад
              </Button>
              <Button size="lg" iconRight={ArrowRight} onClick={next} className="flex-1">
                Следующий этап
              </Button>
            </div>
            {enough && (
              <Button variant="ghost" icon={Check} onClick={finishStages}>
                К описанию квеста
              </Button>
            )}
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {notice}
          <PointLine stage={stage} number={number} />
          <StageForm key={stage.id} stage={stage} />
          {stages.length > 1 && (
            <Button
              variant="ghost"
              icon={Trash2}
              onClick={() => removeStageWithUndo(stage.id)}
              className="self-start text-danger-ink"
            >
              Удалить этап {number}
            </Button>
          )}
        </div>
      </PanelLayout>
    </>
  );
}
