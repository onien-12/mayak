import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Flag, Globe, Lock, MapPinned, Pencil } from 'lucide-react';
import { useState } from 'react';

import { PhotoPicker } from '@/features/places';
import { queryKeys, questsApi, type QuestEditor, type RouteVisibility } from '@/shared/api';
import { formatDuration, plural } from '@/shared/lib/format';
import {
  Banner,
  Button,
  Chip,
  Field,
  Input,
  PanelLayout,
  Textarea,
  usePanelStore,
} from '@/shared/ui';

import { QUEST_PLURALS } from '../lib/meta';
import {
  DURATION_OPTIONS,
  hasStageProblems,
  serverErrors,
  toQuestInput,
  validateDraft,
} from './model';
import { useQuestEditorStore } from './store';

interface DetailsStepProps {
  title: string;
  questId: number | null;
  /** Visibility of the quest being edited; `null` for a new one. */
  visibility: RouteVisibility | null;
  onSaved: (quest: QuestEditor) => void;
}

/** Step 2 «О квесте»: name, story, where to gather, how long, cover — then save or publish. */
export function DetailsStep({ title, questId, visibility, onSaved }: DetailsStepProps) {
  const queryClient = useQueryClient();
  const draft = useQuestEditorStore((state) => state.draft);
  const errors = useQuestEditorStore((state) => state.errors);
  const { setMeta, setStep, setErrors, markSaved, setTool } = useQuestEditorStore.getState();
  const [formError, setFormError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (target: RouteVisibility) => {
      const input = toQuestInput(draft, target);
      return questId === null ? questsApi.create(input) : questsApi.update(questId, input);
    },
    onSuccess: (quest) => {
      markSaved();
      queryClient.setQueryData(queryKeys.quests.editor(quest.id), quest);
      void queryClient.invalidateQueries({ queryKey: queryKeys.quests.all });
      onSaved(quest);
    },
    onError: (error) => {
      const mapped = serverErrors(error, draft);
      setErrors(mapped.errors);
      setFormError(mapped.message);
      if (hasStageProblems(mapped.errors)) setStep('stages');
    },
  });

  const submit = (target: RouteVisibility) => {
    setFormError(null);
    const found = validateDraft(draft);
    setErrors(found);
    if (hasStageProblems(found) || found.start) setStep('stages');
    else if (Object.keys(found).length === 0) save.mutate(target);
    // Phones: the messages are in the sheet — lift it off its lowest snap.
    if (Object.keys(found).length > 0) usePanelStore.getState().reveal();
  };

  const published = visibility === 'public';
  const busy = save.isPending;

  return (
    <PanelLayout
      title={title}
      subtitle="О квесте"
      onBack={() => setStep('stages')}
      backLabel="К этапам"
      footer={
        <div className="flex gap-2">
          <Button
            size="lg"
            variant="secondary"
            icon={Lock}
            className="flex-1"
            disabled={busy}
            onClick={() => submit('private')}
          >
            {published ? 'В черновики' : 'Черновик'}
          </Button>
          <Button
            size="lg"
            icon={Globe}
            className="flex-1"
            loading={busy}
            onClick={() => submit('public')}
          >
            {published ? 'Сохранить' : 'Опубликовать'}
          </Button>
        </div>
      }
    >
      <form noValidate onSubmit={(event) => event.preventDefault()} className="flex flex-col gap-5">
        <button
          type="button"
          onClick={() => setStep('stages')}
          className="flex items-center gap-3 rounded-card bg-canvas p-3 text-left transition-transform active:scale-[0.98]"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-event shadow-card">
            <MapPinned size={18} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">
              {draft.stages.length} {plural(draft.stages.length, QUEST_PLURALS.stage)}
            </span>
            <span className="block text-xs text-ink-soft">
              Игроки увидят только старт и число этапов
            </span>
          </span>
          <Pencil size={16} aria-hidden className="text-ink-faint" />
        </button>

        {formError && <Banner tone="danger">{formError}</Banner>}

        <Field label="Название" htmlFor="quest-title" error={errors.title}>
          <Input
            id="quest-title"
            value={draft.title}
            maxLength={120}
            invalid={Boolean(errors.title)}
            placeholder="Например: Тайны Миллионки"
            onChange={(event) => setMeta({ title: event.target.value })}
          />
        </Field>

        <Field
          label="О квесте"
          htmlFor="quest-description"
          optional
          hint="Что за квест, для кого, сколько идти — без разгадок"
          error={errors.description}
        >
          <Textarea
            id="quest-description"
            rows={4}
            maxLength={5000}
            value={draft.description}
            placeholder="Прогулка-загадка по дворам старого центра. Подойдёт и детям."
            onChange={(event) => setMeta({ description: event.target.value })}
          />
        </Field>

        <Field
          label="Где начинается"
          htmlFor="quest-start"
          hint="Это место увидят все — до начала игры"
          error={errors.startTitle ?? errors.start}
        >
          <Input
            id="quest-start"
            icon={Flag}
            value={draft.startTitle}
            maxLength={120}
            invalid={Boolean(errors.startTitle)}
            placeholder="У входа в ГУМ со Светланской"
            onChange={(event) => setMeta({ startTitle: event.target.value })}
          />
          <Button
            variant="ghost"
            size="sm"
            icon={MapPinned}
            className="self-start"
            onClick={() => {
              setTool('start');
              setStep('stages');
            }}
          >
            {draft.start ? 'Сдвинуть старт на карте' : 'Отметить старт на карте'}
          </Button>
        </Field>

        <Field label="Сколько займёт">
          <div className="flex flex-wrap gap-1.5">
            {[...new Set<number>([...DURATION_OPTIONS, draft.durationMin])]
              .sort((a, b) => a - b)
              .map((minutes) => (
                <Chip
                  key={minutes}
                  selected={draft.durationMin === minutes}
                  onClick={() => setMeta({ durationMin: minutes })}
                >
                  {formatDuration(minutes)}
                </Chip>
              ))}
          </div>
        </Field>

        <Field label="Обложка" optional hint="Не показывайте на ней места этапов">
          <PhotoPicker
            photos={draft.cover ? [draft.cover] : []}
            max={1}
            onChange={(photos) => setMeta({ cover: photos[0] ?? null })}
          />
        </Field>

        <p className="text-sm text-ink-soft">
          Черновик видите только вы — пройдите его как игрок и проверьте загадки. Опубликованный
          квест проходит ту же проверку, что и маршруты.
        </p>
      </form>
    </PanelLayout>
  );
}
