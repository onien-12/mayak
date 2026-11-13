import { Link2Off, Signpost, Sparkles, Trash2 } from 'lucide-react';

import { PhotoPicker } from '@/features/places';
import { useMapObject } from '@/shared/hooks';
import { cn } from '@/shared/lib/cn';
import { formatDuration } from '@/shared/lib/format';
import { STOP_KIND_META, STOP_KINDS } from '@/shared/lib/labels';
import { TONES } from '@/shared/lib/tones';
import { Button, Chip, Field, Input, Modal, Textarea } from '@/shared/ui';

import { removeWithUndo } from './actions';
import { MAX_STOP_PHOTOS, stopNumber, stopTitle, type DraftStop } from './model';
import { useBuilderStore } from './store';

const STAY_OPTIONS = [0, 5, 15, 30, 60, 120] as const;
/** Stable on purpose: the dialog re-runs its focus handling when `onClose` changes. */
const closeEditor = () => useBuilderStore.getState().openEditor(null);

const PICKABLE_KINDS = STOP_KINDS.filter((kind) => kind !== 'via');

/** Preset durations plus the stop's own value when it is not one of them. */
const stayOptions = (current: number) =>
  [...new Set<number>([...STAY_OPTIONS, current])].sort((a, b) => a - b);

function KindGrid({ stop }: { stop: DraftStop }) {
  const updateStop = useBuilderStore((state) => state.updateStop);
  return (
    <div role="radiogroup" aria-label="Что это за точка" className="grid grid-cols-3 gap-1.5">
      {PICKABLE_KINDS.map((kind) => {
        const meta = STOP_KIND_META[kind];
        const selected = stop.kind === kind;
        return (
          <button
            key={kind}
            type="button"
            role="radio"
            aria-checked={selected}
            title={meta.description}
            onClick={() => updateStop(stop.id, { kind })}
            className={cn(
              'flex min-h-16 flex-col items-center justify-center gap-1 rounded-control border px-1 py-2 text-xs font-medium transition-[background-color,border-color,transform] duration-150 active:scale-[0.97]',
              selected
                ? cn(TONES[meta.tone].soft, TONES[meta.tone].border)
                : 'border-line text-ink-soft hover:border-ink-faint/60',
            )}
          >
            <meta.icon size={20} aria-hidden className={cn(!selected && TONES[meta.tone].text)} />
            <span className="max-w-full truncate">{meta.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function TitleField({ stop, number }: { stop: DraftStop; number: number }) {
  const updateStop = useBuilderStore((state) => state.updateStop);
  const object = useMapObject(stop.title.trim() ? null : stop.objectId);
  const suggestion = object.data?.name;

  return (
    <Field
      label="Название"
      htmlFor="stop-title"
      hint={!stop.title.trim() && 'Пусто — назовём по номеру'}
    >
      <Input
        id="stop-title"
        value={stop.title}
        maxLength={120}
        placeholder={stopTitle({ ...stop, title: '' }, number)}
        onChange={(event) => updateStop(stop.id, { title: event.target.value })}
      />
      {suggestion && !stop.title.trim() && (
        <Chip
          icon={Sparkles}
          onClick={() => updateStop(stop.id, { title: suggestion })}
          className="self-start"
        >
          {suggestion}
        </Chip>
      )}
    </Field>
  );
}

/** Sheet with everything about one stop. Changes apply live — the map updates as you type. */
export function StopEditor() {
  const editingId = useBuilderStore((state) => state.editingId);
  const stops = useBuilderStore((state) => state.draft.stops);
  const { updateStop } = useBuilderStore.getState();
  const stop = stops.find((item) => item.id === editingId);
  const number = stop ? stopNumber(stops, stop.id) : 0;

  return (
    <Modal
      open={Boolean(stop)}
      onClose={closeEditor}
      title={stop ? `Точка ${number}` : ''}
      description="Опишите её так, чтобы по описанию можно было пройти без вас."
      footer={
        stop && (
          <>
            <Button variant="secondary" icon={Trash2} onClick={() => removeWithUndo(stop.id)}>
              Удалить
            </Button>
            <Button onClick={closeEditor}>Готово</Button>
          </>
        )
      }
    >
      {stop && (
        <div className="flex flex-col gap-4">
          <TitleField stop={stop} number={number} />
          {stop.place && (
            <div className="flex items-center gap-2 rounded-control bg-canvas py-1.5 pr-1.5 pl-3 text-sm">
              <span className="min-w-0 flex-1 truncate text-ink-soft">
                Место на карте: <span className="font-medium text-ink">{stop.place.title}</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                icon={Link2Off}
                onClick={() => updateStop(stop.id, { place: null })}
              >
                Отвязать
              </Button>
            </div>
          )}
          <Field label="Что это за точка">
            <KindGrid stop={stop} />
          </Field>
          <Field label="Описание" htmlFor="stop-note" optional>
            <Textarea
              id="stop-note"
              rows={3}
              maxLength={2000}
              value={stop.note}
              placeholder="Что посмотреть, чем интересно место, где сделать лучший кадр"
              onChange={(event) => updateStop(stop.id, { note: event.target.value })}
            />
          </Field>
          <Field
            label="Ориентир"
            htmlFor="stop-landmark"
            optional
            hint="Как узнать место или куда свернуть — особенно важно на тропе"
          >
            <Input
              id="stop-landmark"
              icon={Signpost}
              maxLength={500}
              value={stop.landmark}
              placeholder="За красной будкой налево, к морю"
              onChange={(event) => updateStop(stop.id, { landmark: event.target.value })}
            />
          </Field>
          <Field label="Сколько здесь пробыть">
            <div className="-mx-4 no-scrollbar flex gap-1.5 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
              {stayOptions(stop.stayMin).map((minutes) => (
                <Chip
                  key={minutes}
                  selected={stop.stayMin === minutes}
                  onClick={() => updateStop(stop.id, { stayMin: minutes })}
                >
                  {minutes === 0 ? 'Не задерживаться' : formatDuration(minutes)}
                </Chip>
              ))}
            </div>
          </Field>
          <Field
            label="Фото"
            optional
            hint={`До ${MAX_STOP_PHOTOS} фото: вид с точки, вход, развилка`}
          >
            <PhotoPicker
              photos={stop.photos}
              max={MAX_STOP_PHOTOS}
              onChange={(photos) => updateStop(stop.id, { photos })}
            />
          </Field>
        </div>
      )}
    </Modal>
  );
}
