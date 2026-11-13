import { ArrowRight, Flag, Hand, MousePointerClick, Puzzle, X } from 'lucide-react';
import type { ReactNode } from 'react';

import { plural } from '@/shared/lib/format';
import { Banner, Button, Chip, MapTopBar, PanelLayout, usePanelStore } from '@/shared/ui';
import { useIsDesktop } from '@/shared/hooks';

import { QUEST_PLURALS } from '../lib/meta';
import { MIN_STAGES } from './model';
import { StageList } from './StageList';
import { useQuestEditorStore, type EditorTool } from './store';

const STEPS = [
  'Отметьте на карте, где игроки соберутся — инструмент «Старт».',
  'Нажимайте на карту по порядку: каждая точка — этап квеста.',
  'В каждом этапе напишите загадку и выберите, как игрок докажет, что нашёл место.',
  'Сохраните черновик и пройдите квест сами — кнопкой «Пройти как игрок».',
];

function ToolChips({ floating = false }: { floating?: boolean }) {
  const tool = useQuestEditorStore((state) => state.tool);
  const setTool = useQuestEditorStore((state) => state.setTool);
  const showMap = usePanelStore((state) => state.showMap);
  const choose = (value: EditorTool) => {
    setTool(value);
    showMap();
  };
  return (
    <div className={floating ? 'flex gap-1.5' : 'flex flex-wrap gap-1.5'}>
      <Chip icon={Puzzle} selected={tool === 'stage'} onClick={() => choose('stage')}>
        Этап
      </Chip>
      <Chip icon={Flag} selected={tool === 'start'} onClick={() => choose('start')}>
        Старт
      </Chip>
    </div>
  );
}

function Intro() {
  return (
    <ol className="flex flex-col gap-2.5 rounded-card bg-canvas p-4">
      {STEPS.map((text, index) => (
        <li key={text} className="flex items-start gap-3 text-sm text-ink">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-bold text-event shadow-card">
            {index + 1}
          </span>
          <span className="pt-1">{text}</span>
        </li>
      ))}
    </ol>
  );
}

interface StagesStepProps {
  title: string;
  onClose: () => void;
  notice?: ReactNode;
}

/** Step 1 «Этапы»: the start and the stages on the map, in playing order. */
export function StagesStep({ title, onClose, notice }: StagesStepProps) {
  const isDesktop = useIsDesktop();
  const stages = useQuestEditorStore((state) => state.draft.stages);
  const start = useQuestEditorStore((state) => state.draft.start);
  const tool = useQuestEditorStore((state) => state.tool);
  const errors = useQuestEditorStore((state) => state.errors);
  const setStep = useQuestEditorStore((state) => state.setStep);
  const missing = Math.max(0, MIN_STAGES - stages.length);

  return (
    <>
      {!isDesktop && (
        <MapTopBar extra={<ToolChips floating />}>
          <p className="flex h-11 items-center gap-2 rounded-full bg-surface/95 px-4 text-sm font-medium text-ink shadow-float">
            <MousePointerClick size={16} aria-hidden className="shrink-0 text-event" />
            {tool === 'start' ? 'Нажмите на карту, где старт' : 'Нажмите на карту, где этап'}
          </p>
        </MapTopBar>
      )}
      <PanelLayout
        title={title}
        subtitle={
          stages.length === 0
            ? 'Поставьте старт и этапы на карте'
            : `${stages.length} ${plural(stages.length, QUEST_PLURALS.stage)}`
        }
        onBack={onClose}
        backLabel="Закрыть редактор"
        toolbar={isDesktop && <ToolChips />}
        footer={
          <Button
            block
            size="lg"
            iconRight={ArrowRight}
            disabled={missing > 0}
            onClick={() => setStep('details')}
          >
            {missing > 0
              ? `Ещё ${missing} ${plural(missing, QUEST_PLURALS.stage)} — и дальше`
              : 'Далее: о квесте'}
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          {notice}
          {errors.stages && (
            <Banner tone="danger" icon={X}>
              {errors.stages}
            </Banner>
          )}
          {errors.start && (
            <Banner tone="danger" icon={Flag}>
              {errors.start}
            </Banner>
          )}
          {stages.length === 0 ? <Intro /> : <StageList />}
          {stages.length > 0 && (
            <p className="flex items-center gap-2 text-sm text-ink-soft">
              <Hand size={16} aria-hidden className="shrink-0 text-brand" />
              Перетаскивайте точки на карте и строки за ручку, чтобы поменять порядок.
            </p>
          )}
          <p className="flex items-center gap-2 text-sm text-ink-soft">
            {start ? (
              <>
                <Flag size={16} aria-hidden className="shrink-0 text-ink" />
                Старт отмечен — его можно перетащить.
              </>
            ) : (
              <>
                <MousePointerClick size={16} aria-hidden className="shrink-0 text-brand" />
                Старт ещё не отмечен: выберите «Старт» и нажмите на карту.
              </>
            )}
          </p>
        </div>
      </PanelLayout>
    </>
  );
}
