import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MapPinned, Pencil } from 'lucide-react';
import { useState } from 'react';

import { useAuth } from '@/features/auth';
import { TagsInput } from '@/features/places';
import { queryKeys, routesApi, type RouteDetail, type RouteDifficulty } from '@/shared/api';
import { formatDistance, pluralize } from '@/shared/lib/format';
import { ROUTE_DIFFICULTIES, ROUTE_DIFFICULTY_META } from '@/shared/lib/labels';
import { Banner, Button, Chip, Field, Input, PanelLayout, Textarea } from '@/shared/ui';

import { ROUTE_PLURALS } from '../lib/plurals';
import { serverErrors, toRouteInput, validateDraft, visibleCount } from './model';
import { useBuilderStore } from './store';
import type { RoutePreviewState } from './useRoutePreview';
import { VisibilityPicker } from './VisibilityPicker';

const FORM_ID = 'route-details';

function submitLabel(editing: boolean, isPublic: boolean, direct: boolean): string {
  if (editing) return 'Сохранить изменения';
  if (!isPublic) return 'Сохранить для себя';
  return direct ? 'Опубликовать' : 'Отправить на проверку';
}

function DifficultyChips() {
  const difficulty = useBuilderStore((state) => state.draft.difficulty);
  const setMeta = useBuilderStore((state) => state.setMeta);
  const choose = (value: RouteDifficulty) =>
    setMeta({ difficulty: difficulty === value ? null : value });
  return (
    <div className="flex flex-wrap gap-1.5">
      {ROUTE_DIFFICULTIES.map((value) => {
        const meta = ROUTE_DIFFICULTY_META[value];
        return (
          <Chip
            key={value}
            tone={meta.tone}
            icon={meta.icon}
            selected={difficulty === value}
            onClick={() => choose(value)}
          >
            {meta.label}
          </Chip>
        );
      })}
    </div>
  );
}

interface DetailsStepProps {
  title: string;
  routeId: number | null;
  preview: RoutePreviewState;
  onSaved: (route: RouteDetail) => void;
}

/**
 * Step 2 «О маршруте»: name, difficulty, story, tips, tags and who sees it. How the route is
 * travelled is chosen once, on the first step, where the line is built for it.
 */
export function DetailsStep({ title, routeId, preview, onSaved }: DetailsStepProps) {
  const queryClient = useQueryClient();
  const { permissions } = useAuth();
  const draft = useBuilderStore((state) => state.draft);
  const errors = useBuilderStore((state) => state.errors);
  const { setMeta, setStep, setErrors, markSaved } = useBuilderStore.getState();
  const [formError, setFormError] = useState<string | null>(null);
  const difficultyHint = draft.difficulty
    ? ROUTE_DIFFICULTY_META[draft.difficulty].description
    : 'Необязательно';

  const save = useMutation({
    mutationFn: () => {
      const input = toRouteInput(draft);
      return routeId === null ? routesApi.create(input) : routesApi.update(routeId, input);
    },
    onSuccess: (route) => {
      markSaved();
      queryClient.setQueryData(queryKeys.routes.detail(route.id), route);
      void queryClient.invalidateQueries({ queryKey: queryKeys.routes.lists });
      void queryClient.invalidateQueries({ queryKey: queryKeys.routes.mine });
      onSaved(route);
    },
    onError: (error) => {
      const mapped = serverErrors(error);
      setErrors(mapped.errors);
      setFormError(mapped.message);
      if (mapped.errors.stops) setStep('points');
    },
  });

  const submit = () => {
    setFormError(null);
    const found = validateDraft(draft);
    setErrors(found);
    if (found.stops) setStep('points');
    else if (Object.keys(found).length === 0) save.mutate();
  };

  return (
    <PanelLayout
      title={title}
      subtitle="О маршруте"
      onBack={() => setStep('points')}
      backLabel="К точкам"
      footer={
        <Button type="submit" form={FORM_ID} block size="lg" loading={save.isPending}>
          {submitLabel(
            routeId !== null,
            draft.visibility === 'public',
            permissions?.publishes_directly ?? true,
          )}
        </Button>
      }
    >
      <form
        id={FORM_ID}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="flex flex-col gap-5"
      >
        <button
          type="button"
          onClick={() => setStep('points')}
          className="flex items-center gap-3 rounded-card bg-canvas p-3 text-left transition-transform active:scale-[0.98]"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-brand shadow-card">
            <MapPinned size={18} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">
              {pluralize(visibleCount(draft.stops), ROUTE_PLURALS.point)}
            </span>
            <span className="block text-xs text-ink-soft">
              {preview.estimate ? '≈ ' : ''}
              {formatDistance(preview.distanceM)} по маршруту
            </span>
          </span>
          <Pencil size={16} aria-hidden className="text-ink-faint" />
        </button>

        {formError && <Banner tone="danger">{formError}</Banner>}

        <Field label="Название" htmlFor="route-title" error={errors.title}>
          <Input
            id="route-title"
            value={draft.title}
            maxLength={120}
            invalid={Boolean(errors.title)}
            placeholder="Например: Сопки Русского за полдня"
            onChange={(event) => setMeta({ title: event.target.value })}
          />
        </Field>

        <Field label="Сложность" hint={difficultyHint}>
          <DifficultyChips />
        </Field>

        <Field label="Описание" htmlFor="route-description" optional error={errors.description}>
          <Textarea
            id="route-description"
            rows={4}
            value={draft.description}
            invalid={Boolean(errors.description)}
            placeholder="О чём маршрут, чем он хорош, для кого"
            onChange={(event) => setMeta({ description: event.target.value })}
          />
        </Field>

        <Field label="Что взять и когда идти" htmlFor="route-tips" optional error={errors.tips}>
          <Textarea
            id="route-tips"
            rows={3}
            value={draft.tips}
            invalid={Boolean(errors.tips)}
            placeholder="Вода, удобная обувь, лучшее время — на закате, весной после схода снега…"
            onChange={(event) => setMeta({ tips: event.target.value })}
          />
        </Field>

        <Field
          label="Теги"
          htmlFor="route-tags"
          optional
          hint="Enter или запятая — добавить тег"
          error={errors.tags}
        >
          <TagsInput id="route-tags" value={draft.tags} onChange={(tags) => setMeta({ tags })} />
        </Field>

        <Field label="Кто увидит маршрут">
          <VisibilityPicker />
        </Field>
      </form>
    </PanelLayout>
  );
}
