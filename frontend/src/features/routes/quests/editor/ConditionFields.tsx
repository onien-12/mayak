import { Plus } from 'lucide-react';
import { useState } from 'react';

import type { QuestCondition } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { TONES } from '@/shared/lib/tones';
import { Button, Chip, Field, Input, Switch, Textarea } from '@/shared/ui';

import { CONDITION_META, CONDITIONS } from '../lib/meta';
import { RADIUS_OPTIONS, type DraftStage, type StageField } from './model';
import { useQuestEditorStore } from './store';

const HOW: Record<QuestCondition, string> = {
  arrival: 'Игрок нажимает «Я на месте» — сервер сверяет его геолокацию с точкой этапа.',
  code: 'Игрок узнаёт код на месте — у продавца, на вывеске, у вашего помощника — и вводит его.',
  answer: 'Игрок отвечает на вопрос о месте. Регистр, пробелы и «ё» не важны.',
};

function AnswersInput({ stage, error }: { stage: DraftStage; error?: string }) {
  const updateStage = useQuestEditorStore((state) => state.updateStage);
  const [value, setValue] = useState('');
  const add = () => {
    const text = value.trim();
    if (!text || stage.answers.includes(text)) return;
    updateStage(stage.id, { answers: [...stage.answers, text] });
    setValue('');
  };
  return (
    <Field
      label="Правильные ответы"
      htmlFor="stage-answer"
      hint="Добавьте варианты: «зелёная», «изумрудная»"
      error={error}
    >
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <Input
            id="stage-answer"
            value={value}
            maxLength={100}
            invalid={Boolean(error)}
            placeholder="Ответ"
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                add();
              }
            }}
          />
        </div>
        <Button variant="secondary" icon={Plus} onClick={add} aria-label="Добавить ответ">
          Добавить
        </Button>
      </div>
      {stage.answers.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {stage.answers.map((answer) => (
            <Chip
              key={answer}
              selected
              onRemove={() =>
                updateStage(stage.id, { answers: stage.answers.filter((item) => item !== answer) })
              }
            >
              {answer}
            </Chip>
          ))}
        </div>
      )}
    </Field>
  );
}

/** How the player proves they found the place, and the parameters of that check. */
export function ConditionFields({
  stage,
  errors,
}: {
  stage: DraftStage;
  errors: Partial<Record<StageField, string>>;
}) {
  const updateStage = useQuestEditorStore((state) => state.updateStage);
  const checksSite = stage.condition === 'arrival' || stage.checkArrival;

  return (
    <div className="flex flex-col gap-4">
      <Field label="Как засчитать этап" hint={HOW[stage.condition]}>
        <div role="radiogroup" aria-label="Как засчитать этап" className="grid grid-cols-3 gap-1.5">
          {CONDITIONS.map((condition) => {
            const meta = CONDITION_META[condition];
            const selected = stage.condition === condition;
            return (
              <button
                key={condition}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => updateStage(stage.id, { condition })}
                className={cn(
                  'flex min-h-16 flex-col items-center justify-center gap-1 rounded-control border px-1 py-2 text-center text-xs font-medium transition-[background-color,border-color,transform] duration-150 active:scale-[0.97]',
                  selected
                    ? cn(TONES[meta.tone].soft, TONES[meta.tone].border)
                    : 'border-line text-ink-soft hover:border-ink-faint/60',
                )}
              >
                <meta.icon
                  size={20}
                  aria-hidden
                  className={cn(!selected && TONES[meta.tone].text)}
                />
                {meta.label}
              </button>
            );
          })}
        </div>
      </Field>
      {stage.condition === 'code' && (
        <Field
          label="Код"
          htmlFor="stage-code"
          hint="Например, фраза, которую скажет продавец. Регистр и пробелы не важны."
          error={errors.code}
        >
          <Input
            id="stage-code"
            value={stage.code}
            maxLength={100}
            invalid={Boolean(errors.code)}
            placeholder="ПОЛЫНЬ-17"
            onChange={(event) => updateStage(stage.id, { code: event.target.value })}
          />
        </Field>
      )}
      {stage.condition === 'answer' && (
        <>
          <Field label="Вопрос" htmlFor="stage-question" error={errors.question}>
            <Textarea
              id="stage-question"
              rows={2}
              maxLength={500}
              value={stage.question}
              invalid={Boolean(errors.question)}
              placeholder="Какого цвета дверь лавки?"
              onChange={(event) => updateStage(stage.id, { question: event.target.value })}
            />
          </Field>
          <AnswersInput stage={stage} error={errors.answers} />
        </>
      )}
      {stage.condition !== 'arrival' && (
        <Switch
          checked={stage.checkArrival}
          onChange={(checkArrival) => updateStage(stage.id, { checkArrival })}
          label="Проверять, что игрок на месте"
          description="Код или ответ засчитается, только если геолокация совпадает с точкой"
        />
      )}
      {checksSite && (
        <Field
          label="Насколько близко подойти"
          hint="Во дворах и между домами GPS ошибается — берите с запасом"
        >
          <div className="flex flex-wrap gap-1.5">
            {RADIUS_OPTIONS.map((radius) => (
              <Chip
                key={radius}
                selected={stage.radiusM === radius}
                onClick={() => updateStage(stage.id, { radiusM: radius })}
              >
                {radius} м
              </Chip>
            ))}
          </div>
        </Field>
      )}
    </div>
  );
}
