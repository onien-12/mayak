import { Lightbulb, Timer, Trophy } from 'lucide-react';

import type { QuestRun } from '@/shared/api';
import { Banner, Rise, SuccessCheck } from '@/shared/ui';

import { formatResult } from '../lib/meta';
import { QuestResults } from '../page/QuestResults';
import { QuestReviews } from '../page/QuestReviews';
import { useQuest } from '../useQuests';

/** The finish: the time with the hint penalty, the board, and a rating for real runs. */
export function RunFinish({ run }: { run: QuestRun }) {
  const quest = useQuest(run.quest_id).data;
  const elapsed = (run.result_s ?? 0) - run.penalty_min * 60;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-2 pt-2 text-center">
        <SuccessCheck size={88} />
        <Rise delay={0.25} className="flex flex-col items-center gap-1">
          <h2 className="font-display text-xl font-semibold text-ink">Квест пройден!</h2>
          <p className="flex items-center gap-1.5 font-display text-3xl font-semibold text-ink tabular-nums">
            <Timer size={24} aria-hidden className="text-event" />
            {formatResult(run.result_s ?? 0)}
          </p>
          {run.penalty_min > 0 && (
            <p className="flex items-center gap-1 text-sm text-ink-soft">
              <Lightbulb size={14} aria-hidden className="text-warning-ink" />
              {formatResult(elapsed)} в пути + {run.penalty_min} мин за подсказки
            </p>
          )}
        </Rise>
      </div>
      {run.is_test ? (
        <Banner tone="neutral" icon={Trophy} title="Это была проверка">
          Тестовое прохождение автора не попадает в таблицу и не считается в «прошли».
        </Banner>
      ) : (
        !run.ranked && (
          <Banner tone="neutral" icon={Trophy} title="Повторное прохождение">
            В таблицу идёт только первое прохождение — загадки вы уже знали.
          </Banner>
        )
      )}
      <QuestResults questId={run.quest_id} />
      {quest && !run.is_test && <QuestReviews quest={quest} />}
    </div>
  );
}
