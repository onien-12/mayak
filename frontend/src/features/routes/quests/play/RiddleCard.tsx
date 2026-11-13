import { CircleDashed, Lightbulb, MessagesSquare, ScrollText } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';

import type { QuestCurrentStage, QuestRun } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { TONES } from '@/shared/lib/tones';
import { Avatar, Button, ConfirmDialog, PhotoGrid, SPRING } from '@/shared/ui';

import { CONDITION_META, HINT_PENALTY_MIN } from '../lib/meta';

function HolderNotice({ stage }: { stage: QuestCurrentStage }) {
  const holder = stage.riddle_holder;
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border-2 border-dashed border-event/40 bg-event-soft/60 px-4 py-5 text-center">
      {holder && <Avatar id={holder.id} name={holder.display_name} size={44} />}
      <p className="font-display text-lg font-semibold text-ink">
        {holder ? `Загадку ведёт ${holder.display_name}` : 'Загадка у ведущего этапа'}
      </p>
      <p className="flex items-start gap-2 text-left text-sm text-ink-soft">
        <MessagesSquare size={16} aria-hidden className="mt-0.5 shrink-0 text-event" />
        Текст загадки этого этапа есть только у ведущего. Расспросите ведущего и ищите место вместе
        — код, ответ или «Я на месте» может отправить любой.
      </p>
    </div>
  );
}

function Hint({ run, stage, onTake, taking }: HintProps) {
  const [asking, setAsking] = useState(false);
  if (stage.hint) {
    return (
      <p className="flex gap-2 rounded-control bg-beam-soft p-3 text-sm text-ink">
        <Lightbulb size={16} aria-hidden className="mt-0.5 shrink-0 text-warning-ink" />
        <span>
          <span className="font-semibold">Подсказка: </span>
          {stage.hint}
        </span>
      </p>
    );
  }
  if (!stage.has_hint) return null;
  return (
    <>
      <Button
        variant="soft"
        icon={Lightbulb}
        className="self-start"
        onClick={() => setAsking(true)}
      >
        Подсказка · +{HINT_PENALTY_MIN} мин
      </Button>
      <ConfirmDialog
        open={asking}
        onClose={() => setAsking(false)}
        onConfirm={() => {
          setAsking(false);
          onTake();
        }}
        title="Открыть подсказку?"
        description={`Она добавит ${HINT_PENALTY_MIN} минут к ${run.is_team ? 'времени команды' : 'вашему времени'} в таблице результатов.${run.is_team ? ' Подсказку увидят все в команде.' : ''}`}
        confirmLabel={`Открыть, +${HINT_PENALTY_MIN} мин`}
        cancelLabel="Подумаю ещё"
        loading={taking}
      />
    </>
  );
}

interface HintProps {
  run: QuestRun;
  stage: QuestCurrentStage;
  onTake: () => void;
  taking: boolean;
}

/** The current stage: the riddle (or who holds it), what to do on site, the search zone, the hint. */
export function RiddleCard({
  run,
  stage,
  onTakeHint,
  takingHint,
}: {
  run: QuestRun;
  stage: QuestCurrentStage;
  onTakeHint: () => void;
  takingHint: boolean;
}) {
  const condition = CONDITION_META[stage.condition];
  return (
    <motion.div
      key={stage.position}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING.soft}
      className="flex flex-col gap-4"
    >
      {stage.riddle !== null ? (
        <div className="relative overflow-hidden rounded-card border border-beam/60 bg-beam-soft/70 p-4">
          <ScrollText
            size={64}
            aria-hidden
            className="absolute -right-3 -bottom-3 rotate-12 text-beam/50"
          />
          <p className="relative text-xs font-semibold tracking-wide text-warning-ink uppercase">
            Загадка
          </p>
          <p className="relative mt-1.5 font-display text-lg leading-snug font-medium whitespace-pre-line text-ink">
            {stage.riddle}
          </p>
          {stage.photo && (
            <PhotoGrid photos={[stage.photo]} alt="Фото к загадке" className="relative mt-3" />
          )}
        </div>
      ) : (
        <HolderNotice stage={stage} />
      )}
      <div className="flex items-start gap-3 rounded-control bg-canvas p-3">
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-full',
            TONES[condition.tone].soft,
          )}
        >
          <condition.icon size={16} aria-hidden />
        </span>
        <div className="min-w-0 text-sm text-ink">
          <p className="font-semibold">{condition.label}</p>
          <p className="text-ink-soft">{condition.task}</p>
          {stage.condition !== 'arrival' && stage.check_arrival && (
            <p className="mt-1 text-ink-soft">Сработает, только когда вы на месте.</p>
          )}
        </div>
      </div>
      {stage.question && (
        <p className="rounded-control border border-line p-3 text-base font-medium text-ink">
          {stage.question}
        </p>
      )}
      {stage.zone && (
        <p className="flex items-start gap-2 text-sm text-ink-soft">
          <CircleDashed size={16} aria-hidden className="mt-0.5 shrink-0 text-event" />
          На карте — примерный круг поиска: место внутри, но не обязательно в центре.
        </p>
      )}
      <Hint run={run} stage={stage} onTake={onTakeHint} taking={takingHint} />
    </motion.div>
  );
}
