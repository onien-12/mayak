import { Controller, useFormContext, useWatch } from 'react-hook-form';

import { MapCircle } from '@/features/map';
import type { LatLng } from '@/shared/lib/geo';
import { SEVERITIES, SEVERITY_META } from '@/shared/lib/labels';
import { Field, Input, SegmentedControl } from '@/shared/ui';

import type { PlaceFormValues } from './placeForm';

const SEVERITY_OPTIONS = SEVERITIES.map((value) => ({ value, label: SEVERITY_META[value].label }));

/** Issue-only fields: severity and an optional affected radius (previewed on the map). */
export function IssueFields({ point }: { point: LatLng }) {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<PlaceFormValues>();
  const severity = useWatch({ control, name: 'issue.severity' });
  const radius = Number(useWatch({ control, name: 'issue.radius' }));
  const radiusValid = Number.isInteger(radius) && radius >= 50 && radius <= 5000;

  return (
    <div className="flex flex-col gap-4">
      {radiusValid && <MapCircle center={point} radiusM={radius} />}
      <Field label="Насколько серьёзно" hint={SEVERITY_META[severity].description}>
        <Controller
          control={control}
          name="issue.severity"
          render={({ field }) => (
            <SegmentedControl
              label="Серьёзность проблемы"
              value={field.value}
              onChange={field.onChange}
              options={SEVERITY_OPTIONS}
            />
          )}
        />
      </Field>
      <Field
        label="Радиус затронутой территории, м"
        htmlFor="issue-radius"
        optional
        hint="Для отключений воды, света, тепла — от 50 до 5000 м"
        error={errors.issue?.radius?.message}
      >
        <Input
          id="issue-radius"
          inputMode="numeric"
          placeholder="Например, 300"
          invalid={Boolean(errors.issue?.radius)}
          {...register('issue.radius')}
        />
      </Field>
    </div>
  );
}
