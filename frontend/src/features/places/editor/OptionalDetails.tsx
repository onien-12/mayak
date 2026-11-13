import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { Controller, useFormContext } from 'react-hook-form';

import type { FieldDef } from '@/shared/api';
import { Field, Textarea } from '@/shared/ui';

import { AttributeFields } from './AttributeFields';
import type { PlaceFormValues } from './placeForm';
import { TagsInput } from './TagsInput';

interface OptionalDetailsProps {
  /** Category-specific fields. */
  fields: readonly FieldDef[];
  /** «Совет от местного» — tourism only. */
  tips: boolean;
  initiallyOpen: boolean;
}

/** «Подробности — по желанию»: category fields, a local tip and tags, revealed on demand. */
export function OptionalDetails({ fields, tips, initiallyOpen }: OptionalDetailsProps) {
  const [expanded, setExpanded] = useState(initiallyOpen);
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext<PlaceFormValues>();

  return (
    <>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        className="flex min-h-11 items-center justify-between rounded-control bg-canvas px-3.5 text-sm font-semibold text-ink"
      >
        Подробности — по желанию
        <ChevronDown
          size={18}
          aria-hidden
          className={`text-ink-faint transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <div className="flex animate-fade-in flex-col gap-4">
          {fields.length > 0 && <AttributeFields fields={fields} />}
          {tips && (
            <Field
              label="Совет от местного"
              htmlFor="place-tips"
              optional
              error={errors.tips?.message}
            >
              <Textarea
                id="place-tips"
                rows={2}
                placeholder="Как добраться, когда лучше приходить, что взять с собой"
                {...register('tips')}
              />
            </Field>
          )}
          <Field
            label="Теги"
            htmlFor="place-tags"
            optional
            hint="Enter или запятая — добавить тег"
            error={errors.tags?.message}
          >
            <Controller
              control={control}
              name="tags"
              render={({ field }) => (
                <TagsInput id="place-tags" value={field.value} onChange={field.onChange} />
              )}
            />
          </Field>
        </div>
      )}
    </>
  );
}
