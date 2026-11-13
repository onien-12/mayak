import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { History, MapPin } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { FormProvider, useForm, type FieldErrors } from 'react-hook-form';

import { useAuth } from '@/features/auth';
import {
  errorMessage,
  placesApi,
  queryKeys,
  type Layer,
  type Photo,
  type PlaceDetail,
} from '@/shared/api';
import { useReverseGeocode } from '@/shared/hooks';
import { LAYER_META } from '@/shared/lib/labels';
import { applyServerErrors } from '@/shared/lib/serverErrors';
import {
  Banner,
  Button,
  CategoryIcon,
  Field,
  Input,
  PanelLayout,
  Textarea,
  usePanelStore,
  toast,
} from '@/shared/ui';

import { syncPlace } from '../card/usePlace';
import { areaIdOf, initialAreaChoice, type AreaChoice } from './areaChoice';
import { AreaField } from './AreaField';
import { clearDraft, draftScope, hasContent, readDraft, writeDraft } from './draftStore';
import { EventFields } from './EventFields';
import { IssueFields } from './IssueFields';
import { OptionalDetails } from './OptionalDetails';
import { PhotoPicker } from './PhotoPicker';
import { toPlaceInput, toPlaceUpdate, type PlaceDraft, type PlaceFormValues } from './placeForm';
import { placeSchema } from './placeSchema';
import { PublishNotice } from './PublishNotice';
import type { StepFrame } from './StepFrame';

const FORM_ID = 'place-form';
/** How long after the last keystroke the draft is written. */
const DRAFT_DELAY_MS = 400;

/** How the fields are called in a message about what stopped the publication. */
const FIELD_NAMES: Record<string, string> = {
  title: 'название',
  description: 'описание',
  address: 'адрес',
  tips: 'совет',
  tags: 'теги',
  starts_at: 'начало',
  ends_at: 'окончание',
  price: 'цена',
  capacity: 'число мест',
  age_limit: 'возраст',
  registration_url: 'ссылка на регистрацию',
  contact: 'контакт',
  repeat_interval: 'повтор',
  repeat_count: 'повтор',
  radius: 'радиус',
};

/** The first message among the (nested) field errors, in the order of the form: «название — …». */
function firstErrorMessage(errors: FieldErrors): string | undefined {
  for (const [key, value] of Object.entries(errors)) {
    if (!value || typeof value !== 'object') continue;
    if ('message' in value && typeof value.message === 'string') {
      const name = FIELD_NAMES[key];
      const message = value.message;
      // A validator's own wording («Invalid input…») says nothing to the author.
      if (!/[а-яё]/i.test(message)) return name ? `проверьте поле «${name}»` : undefined;
      return name ? `${name} — ${message.charAt(0).toLowerCase()}${message.slice(1)}` : message;
    }
    const nested = firstErrorMessage(value as FieldErrors);
    if (nested) return nested;
  }
  return undefined;
}

const SERVER_FIELDS = ['title', 'description', 'address', 'tips', 'tags'] as const;

const PLACE_COPY = {
  titleLabel: 'Название',
  title: 'Как это место называют',
  description: 'Что важно знать: как найти, что внутри, на что обратить внимание',
};

/** Field wording per layer: an event or a problem is not a «место». */
const COPY: Record<Layer, typeof PLACE_COPY> = {
  infrastructure: PLACE_COPY,
  tourism: PLACE_COPY,
  event: {
    titleLabel: 'Название события',
    title: 'Например: Баскетбол три на три',
    description: 'Что будет, для кого, что взять с собой',
  },
  issue: { ...PLACE_COPY, title: 'Коротко: что случилось' },
};

interface DetailsStepProps {
  frame: StepFrame;
  draft: PlaceDraft;
  /** The place being edited; `undefined` when creating. */
  editing: PlaceDetail | undefined;
  defaultValues: PlaceFormValues;
  /** «Добавить место сюда» from an area card: that area is preselected. */
  presetAreaId?: number;
  onChangeCategory: () => void;
  onChangePoint: () => void;
  onSaved: (place: PlaceDetail) => void;
}

/** Step 4: the compact form — only the title is required, the rest is revealed on demand. */
export function DetailsStep({
  frame,
  draft,
  editing,
  defaultValues,
  presetAreaId,
  onChangeCategory,
  onChangePoint,
  onSaved,
}: DetailsStepProps) {
  const queryClient = useQueryClient();
  const [areaChoice, setAreaChoice] = useState<AreaChoice>(() =>
    initialAreaChoice(draft.point, editing, presetAreaId, queryClient),
  );
  const { permissions } = useAuth();
  const setSnap = usePanelStore((state) => state.setSnap);
  // What was typed here before: the step remounts when the category or the point changes, and
  // a publication in progress must survive a closed panel or a reloaded page.
  const scope = draftScope(draft.layer, editing?.id);
  const categoryId = draft.category.id;
  const { lat, lng } = draft.point;
  const [restored] = useState(() => readDraft(scope));
  const [continued, setContinued] = useState(
    () => restored !== null && !editing && hasContent(restored),
  );
  const [photos, setPhotos] = useState<Photo[]>(restored?.photos ?? editing?.photos ?? []);
  const [initialValues] = useState<PlaceFormValues>(() => {
    if (!restored) return defaultValues;
    const samePoint = restored.point.lat === lat && restored.point.lng === lng;
    return {
      ...restored.values,
      address: samePoint ? restored.values.address : defaultValues.address,
      attributes: restored.categoryId === categoryId ? restored.values.attributes : {},
    };
  });
  const form = useForm<PlaceFormValues>({
    resolver: zodResolver(placeSchema(draft.layer)),
    defaultValues: initialValues,
  });
  const { register, handleSubmit, setError, setValue, getFieldState, formState } = form;
  const { subscribe, getValues } = form;
  const published = useRef(false);

  useEffect(() => {
    const store = () => {
      if (published.current) return;
      writeDraft({ scope, categoryId, point: { lat, lng }, values: getValues(), photos });
    };
    let timer: number | undefined;
    const unsubscribe = subscribe({
      formState: { values: true },
      callback: () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(store, DRAFT_DELAY_MS);
      },
    });
    store();
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
      store();
    };
  }, [subscribe, getValues, scope, categoryId, lat, lng, photos]);

  const startOver = () => {
    form.reset(defaultValues);
    setPhotos([]);
    setContinued(false);
  };
  const { errors } = formState;
  const { fields } = draft.category;
  const copy = COPY[draft.layer];

  useEffect(() => setSnap('full'), [setSnap]);

  const geocoded = useReverseGeocode(initialValues.address ? null : draft.point).data;
  useEffect(() => {
    if (geocoded && !getFieldState('address').isDirty) setValue('address', geocoded);
  }, [geocoded, getFieldState, setValue]);

  const save = useMutation({
    mutationFn: (values: PlaceFormValues) => {
      const photoIds = photos.map((photo) => photo.id);
      const located = { ...draft, areaId: areaIdOf(areaChoice) };
      return editing
        ? placesApi.update(editing.id, toPlaceUpdate(values, located, photoIds))
        : placesApi.create(toPlaceInput(values, located, photoIds));
    },
    onSuccess: (place) => {
      published.current = true;
      clearDraft(scope);
      syncPlace(queryClient, place);
      void queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });
      void queryClient.invalidateQueries({ queryKey: queryKeys.areas.all });
      onSaved(place);
    },
    onError: (error) => {
      applyServerErrors(error, setError, SERVER_FIELDS);
      // The banner and the field may be scrolled out of sight; the reason must not be.
      toast.error(errorMessage(error));
    },
  });

  /** The button was pressed and nothing was sent: say why and bring the field into view. */
  const explain = (invalid: FieldErrors<PlaceFormValues>) => {
    toast.error(`Не опубликовано: ${firstErrorMessage(invalid) ?? 'проверьте поля формы'}`);
    requestAnimationFrame(() =>
      document
        .querySelector(`#${FORM_ID} [aria-invalid="true"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' }),
    );
  };

  const blocked = !editing && permissions !== null && permissions.places_left_today <= 0;

  return (
    <PanelLayout
      {...frame}
      footer={
        <Button
          type="submit"
          form={FORM_ID}
          block
          size="lg"
          loading={save.isPending}
          disabled={blocked}
        >
          {editing ? 'Сохранить изменения' : 'Опубликовать'}
        </Button>
      }
    >
      <FormProvider {...form}>
        <form
          id={FORM_ID}
          noValidate
          onSubmit={handleSubmit((values) => save.mutate(values), explain)}
          className="flex flex-col gap-4"
        >
          <div className="flex items-center gap-3 rounded-card bg-canvas p-2.5">
            <CategoryIcon
              slug={draft.category.slug}
              layer={draft.layer}
              size={40}
              variant="solid"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{draft.category.name}</p>
              <p className="truncate text-xs text-ink-soft">{LAYER_META[draft.layer].label}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={onChangeCategory}>
              Изменить
            </Button>
          </div>

          {continued && (
            <Banner
              icon={History}
              title="Продолжаем черновик"
              action={
                <Button variant="secondary" size="sm" onClick={startOver}>
                  Начать заново
                </Button>
              }
            >
              Вернули то, что вы заполняли в прошлый раз.
            </Banner>
          )}

          {errors.root && <Banner tone="danger">{errors.root.message}</Banner>}

          <Field label={copy.titleLabel} htmlFor="place-title" error={errors.title?.message}>
            <Input
              id="place-title"
              placeholder={copy.title}
              invalid={Boolean(errors.title)}
              maxLength={120}
              {...register('title')}
            />
          </Field>

          {draft.layer === 'event' && <EventFields allowRepeat={!editing} />}
          {draft.layer === 'issue' && <IssueFields point={draft.point} />}

          <Field
            label="Описание"
            htmlFor="place-description"
            optional
            error={errors.description?.message}
          >
            <Textarea
              id="place-description"
              rows={3}
              placeholder={copy.description}
              {...register('description')}
            />
          </Field>

          <Field
            label="Адрес или ориентир"
            htmlFor="place-address"
            optional
            error={errors.address?.message}
          >
            <Input
              id="place-address"
              icon={MapPin}
              placeholder="Определим по точке, можно уточнить"
              trailing={
                <Button variant="ghost" size="sm" onClick={onChangePoint}>
                  Точка
                </Button>
              }
              className="pr-20"
              {...register('address')}
            />
          </Field>

          <AreaField point={draft.point} value={areaChoice} onChange={setAreaChoice} />

          <Field label="Фото" optional hint="До 8 фото — с ними публикации доверяют больше">
            <PhotoPicker photos={photos} onChange={setPhotos} />
          </Field>

          <OptionalDetails
            fields={fields}
            tips={draft.layer === 'tourism'}
            initiallyOpen={Boolean(editing)}
          />

          {!editing && permissions && <PublishNotice permissions={permissions} />}
        </form>
      </FormProvider>
    </PanelLayout>
  );
}
