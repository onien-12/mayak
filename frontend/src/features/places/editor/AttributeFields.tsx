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

/** Optional facts defined by the category `fields` (drives the card and attribute filters). */
export function AttributeFields({ fields }: { fields: readonly FieldDef[] }) {
  const { control, register } = useFormContext<PlaceFormValues>();
  // «Бесплатно — да» leaves nothing to say about the price: such fields step aside.
  const answers = useWatch({ control, name: 'attributes' });
  const asked = fields.filter((field) => isRelevantFact(field.key, answers));
  const booleans = asked.filter((field) => field.type === 'boolean');
  const others = asked.filter((field) => field.type !== 'boolean');

  return (
    <div className="flex flex-col gap-3">
      {booleans.length > 0 && (
        <div className="divide-y divide-line rounded-card border border-line px-3.5">
          {booleans.map((field) => (
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
      )}
      {others.map((field) => {
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
                {...register(`attributes.${field.key}`)}
              />
            )}
          </Field>
        );
      })}
    </div>
  );
}
