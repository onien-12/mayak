import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LandPlot, PenLine } from 'lucide-react';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { useAreaParam } from '@/features/map';
import { ApiError, areasApi, type AreaDetail, type AreaKind } from '@/shared/api';
import { AREA_KIND_META, AREA_KINDS } from '@/shared/lib/labels';
import { applyServerErrors } from '@/shared/lib/serverErrors';
import {
  Banner,
  Button,
  Chip,
  Field,
  Input,
  PanelLayout,
  Textarea,
  toast,
  usePanelStore,
} from '@/shared/ui';

import { syncArea } from '../card/useArea';
import type { StepFrame } from './StepFrame';
import type { BoundsDraft } from './useBoundsDraft';

const FORM_ID = 'area-form';
const SERVER_FIELDS = ['title', 'kind', 'description'] as const;

const schema = z.object({
  title: z.string().trim().min(3, 'Минимум 3 символа').max(80, 'Не длиннее 80 символов'),
  kind: z.enum(AREA_KINDS as [AreaKind, ...AreaKind[]]),
  description: z.string().max(5000, 'Не длиннее 5000 символов'),
});

type AreaFormValues = z.infer<typeof schema>;

interface AreaDetailsStepProps {
  frame: StepFrame;
  draft: BoundsDraft;
  editing: AreaDetail | undefined;
  defaults: AreaFormValues;
  objectId: string | undefined;
  onBackToBounds: () => void;
  onDone: () => void;
}

const geometryRejected = (error: unknown) =>
  error instanceof ApiError && error.errors.some((item) => item.field.startsWith('geometry'));

/** Step 2 «О локации»: title, kind and description; saves and opens the area card. */
export function AreaDetailsStep({
  frame,
  draft,
  editing,
  defaults,
  objectId,
  onBackToBounds,
  onDone,
}: AreaDetailsStepProps) {
  const queryClient = useQueryClient();
  const { openArea } = useAreaParam();
  const setSnap = usePanelStore((state) => state.setSnap);
  const { register, control, handleSubmit, setError, formState } = useForm<AreaFormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  });
  const { errors } = formState;

  useEffect(() => setSnap('full'), [setSnap]);

  const save = useMutation({
    mutationFn: (values: AreaFormValues) => {
      const geometry = draft.geometry ?? undefined;
      const fields = { ...values, description: values.description.trim() };
      return editing
        ? areasApi.update(editing.id, { ...fields, ...(draft.changed && { geometry }) })
        : areasApi.create({ ...fields, geometry, object_id: objectId });
    },
    onSuccess: (area) => {
      syncArea(queryClient, area);
      toast.success(editing ? 'Локация обновлена' : 'Локация появилась на карте');
      onDone();
      openArea(area.id);
    },
    onError: (error) => {
      if (geometryRejected(error)) {
        setError('root', {
          type: 'geometry',
          message: 'Сервер не принял границы: проверьте, что контур не пересекает сам себя.',
        });
        return;
      }
      applyServerErrors(error, setError, SERVER_FIELDS);
    },
  });

  return (
    <PanelLayout
      {...frame}
      footer={
        <Button type="submit" form={FORM_ID} block size="lg" loading={save.isPending}>
          {editing ? 'Сохранить' : 'Создать локацию'}
        </Button>
      }
    >
      <form
        id={FORM_ID}
        noValidate
        onSubmit={handleSubmit((values) => save.mutate(values))}
        className="flex flex-col gap-4"
      >
        {errors.root && (
          <Banner
            tone="danger"
            action={
              errors.root.type === 'geometry' && (
                <Button size="sm" variant="secondary" onClick={onBackToBounds}>
                  К границам
                </Button>
              )
            }
          >
            {errors.root.message}
          </Banner>
        )}
        <Field label="Название" htmlFor="area-title" error={errors.title?.message}>
          <Input
            id="area-title"
            placeholder="Как это место называют в городе"
            invalid={Boolean(errors.title)}
            maxLength={80}
            {...register('title')}
          />
        </Field>
        <Field label="Что это за место">
          <Controller
            control={control}
            name="kind"
            render={({ field }) => (
              <div role="radiogroup" aria-label="Тип локации" className="flex flex-wrap gap-2">
                {AREA_KINDS.map((kind) => (
                  <Chip
                    key={kind}
                    icon={AREA_KIND_META[kind].icon}
                    tone={AREA_KIND_META[kind].tone}
                    selected={field.value === kind}
                    onClick={() => field.onChange(kind)}
                  >
                    {AREA_KIND_META[kind].label}
                  </Chip>
                ))}
              </div>
            )}
          />
        </Field>
        <Field
          label="Описание"
          htmlFor="area-description"
          optional
          error={errors.description?.message}
        >
          <Textarea
            id="area-description"
            rows={4}
            placeholder="Чем здесь заняться, как добраться, когда лучше приходить"
            {...register('description')}
          />
        </Field>
        {editing && (
          <div className="flex items-center gap-3 rounded-card bg-canvas p-3">
            <LandPlot size={18} aria-hidden className="shrink-0 text-ink-soft" />
            <span className="flex-1 text-sm text-ink">
              {draft.changed ? 'Границы изменены' : 'Границы территории'}
            </span>
            <Button size="sm" variant="ghost" icon={PenLine} onClick={onBackToBounds}>
              Изменить
            </Button>
          </div>
        )}
        {draft.attribution && (
          <p className="text-xs text-ink-faint">Границы: {draft.attribution}</p>
        )}
      </form>
    </PanelLayout>
  );
}

export type { AreaFormValues };
