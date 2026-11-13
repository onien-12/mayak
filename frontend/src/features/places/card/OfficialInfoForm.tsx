import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';

import {
  errorMessage,
  placesApi,
  type IssueOfficialInput,
  type IssueStage,
  type PlaceDetail,
} from '@/shared/api';
import { fromLocalInputValue } from '@/shared/lib/format';
import { ISSUE_STAGE_META, ISSUE_STAGES } from '@/shared/lib/labels';
import { Button, Field, Input, Select, Textarea, toast } from '@/shared/ui';

import { syncPlace } from './usePlace';

interface OfficialValues {
  stage: IssueStage;
  official_note: string;
  responsible_org: string;
  appeal_number: string;
  /** `YYYY-MM-DD` or empty. */
  expected_fix_at: string;
}

const STAGE_OPTIONS = ISSUE_STAGES.map((stage) => ({
  value: stage,
  label: ISSUE_STAGE_META[stage].label,
}));
const nullable = (value: string) => value.trim() || null;

interface OfficialInfoFormProps {
  place: PlaceDetail;
  onDone: () => void;
}

/** Moderator-only: stage and official information about an issue. */
export function OfficialInfoForm({ place, onDone }: OfficialInfoFormProps) {
  const queryClient = useQueryClient();
  const issue = place.issue;
  const { register, handleSubmit } = useForm<OfficialValues>({
    defaultValues: {
      stage: issue?.stage ?? 'detected',
      official_note: issue?.official_note ?? '',
      responsible_org: issue?.responsible_org ?? '',
      appeal_number: issue?.appeal_number ?? '',
      expected_fix_at: issue?.expected_fix_at?.slice(0, 10) ?? '',
    },
  });

  const save = useMutation({
    mutationFn: (values: OfficialValues) => {
      const input: IssueOfficialInput = {
        stage: values.stage,
        official_note: nullable(values.official_note),
        responsible_org: nullable(values.responsible_org),
        appeal_number: nullable(values.appeal_number),
        expected_fix_at: values.expected_fix_at
          ? fromLocalInputValue(`${values.expected_fix_at}T12:00`)
          : null,
      };
      return placesApi.updateIssueOfficial(place.id, input);
    },
    onSuccess: (updated) => {
      syncPlace(queryClient, updated);
      toast.success('Официальная информация сохранена');
      onDone();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <form
      onSubmit={handleSubmit((values) => save.mutate(values))}
      className="flex flex-col gap-3 rounded-card border border-official/25 bg-official-soft/50 p-3.5"
    >
      <Field label="Этап" htmlFor="official-stage">
        <Select id="official-stage" options={STAGE_OPTIONS} {...register('stage')} />
      </Field>
      <Field label="Официальный комментарий" htmlFor="official-note" optional>
        <Textarea
          id="official-note"
          rows={3}
          placeholder="Что известно от ответственной организации"
          {...register('official_note')}
        />
      </Field>
      <Field label="Ответственная организация" htmlFor="official-org" optional>
        <Input
          id="official-org"
          placeholder="Например, МУП «ВПЭС»"
          {...register('responsible_org')}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Номер обращения" htmlFor="official-number" optional>
          <Input id="official-number" {...register('appeal_number')} />
        </Field>
        <Field label="Срок устранения" htmlFor="official-fix" optional>
          <Input id="official-fix" type="date" {...register('expected_fix_at')} />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={onDone} className="flex-1">
          Отмена
        </Button>
        <Button type="submit" loading={save.isPending} className="flex-1">
          Сохранить
        </Button>
      </div>
    </form>
  );
}
