import { Controller, useFormContext, useWatch } from 'react-hook-form';

import type { FieldDef } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { Field, Input, Select } from '@/shared/ui';

import { isRelevantFact } from '../attributeRules';
import type { PlaceFormValues } from './placeForm';

const ANSWERS = [
  { value: true, label: 'Да' },
  { value: false, label: 'Нет' },
] as const;

interface YesNoProps {
  label: string;
  value: boolean | null;
  onChange: (value: boolean | null) => void;
}

/** Boolean fact with a third "not specified" state: tapping the active answer clears it. */
function YesNo({ label, value, onChange }: YesNoProps) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <span className="text-base text-ink">{label}</span>
      <div role="group" aria-label={label} className="flex shrink-0 gap-1.5">
        {ANSWERS.map((answer) => {
          const selected = value === answer.value;
          return (
            <button
              key={answer.label}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(selected ? null : answer.value)}
              className={cn(
                'tap-target relative h-9 min-w-13 rounded-full border px-3 text-sm font-medium transition-colors duration-150',
                selected
                  ? 'border-brand bg-brand text-white'
                  : 'border-line bg-surface text-ink-soft',
              )}
            >
              {answer.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Hints for text facts the resident formats ask up front (SPEC §3.4). */
const PLACEHOLDERS: Record<string, string> = {
  offer: 'Детские вещи, книги, посуда',
  bring: 'Перчатки, отвёртку',
  activities: 'Тренировки, лекции, настолки, клубы',
  booking: 'Телеграм, телефон или «спросить администратора»',
  hours: 'Например: будни 10–20',
};

/**
 * Facts defined by the category `fields` (drives the card and attribute filters). By default
 * the yes/no questions come first in one box; `inOrder` keeps the declared order — a format's
 * own questions read top to bottom (consecutive yes/no ones still share a box).
 */
export function AttributeFields({
  fields,
  inOrder = false,
}: {
  fields: readonly FieldDef[];
  inOrder?: boolean;
}) {
  const { control, register } = useFormContext<PlaceFormValues>();
  // «Бесплатно — да» leaves nothing to say about the price: such fields step aside.
  const answers = useWatch({ control, name: 'attributes' });
  const asked = fields.filter((field) => isRelevantFact(field.key, answers));
  const ordered = inOrder
    ? asked
    : [
        ...asked.filter((field) => field.type === 'boolean'),
        ...asked.filter((field) => field.type !== 'boolean'),
      ];
  // Runs of yes/no questions, each rendered as one box; other fields stand alone.
  const blocks: { key: string; yesNo: boolean; fields: FieldDef[] }[] = [];
  for (const field of ordered) {
    const yesNo = field.type === 'boolean';
    const last = blocks.at(-1);
    if (yesNo && last?.yesNo) last.fields.push(field);
    else blocks.push({ key: field.key, yesNo, fields: [field] });
  }

  const yesNoBox = (key: string, box: FieldDef[]) => (
    <div key={key} className="divide-y divide-line rounded-card border border-line px-3.5">
      {box.map((field) => (
        <Controller
          key={field.key}
          control={control}
          name={`attributes.${field.key}`}
          render={({ field: input }) => (
            <YesNo
              label={field.label}
              value={typeof input.value === 'boolean' ? input.value : null}
              onChange={input.onChange}
            />
          )}
        />
      ))}
    </div>
  );

  const single = (field: FieldDef) => {
    const id = `attr-${field.key}`;
    const label = field.unit ? `${field.label}, ${field.unit}` : field.label;
    return (
      <Field key={field.key} label={label} htmlFor={id}>
        {field.type === 'select' ? (
          <Select
            id={id}
            placeholder="Не указано"
            options={field.options ?? []}
            {...register(`attributes.${field.key}`)}
          />
        ) : (
          <Input
            id={id}
            inputMode={field.type === 'number' ? 'decimal' : undefined}
            placeholder={PLACEHOLDERS[field.key]}
            {...register(`attributes.${field.key}`)}
          />
        )}
      </Field>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block) =>
        block.yesNo ? yesNoBox(block.key, block.fields) : block.fields.map(single),
      )}
    </div>
  );
}
