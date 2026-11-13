import { CircleDashed, Sparkles, Trash2 } from 'lucide-react';

import { PhotoPicker } from '@/features/places';
import { useMapObject } from '@/shared/hooks';
import { Button, Chip, Field, Input, Modal, SegmentedControl, Textarea, toast } from '@/shared/ui';

import { HINT_PENALTY_MIN } from '../lib/meta';
import { ConditionFields } from './ConditionFields';
import { ZONE_OPTIONS, type DraftStage } from './model';
import { closeStageEditor, useQuestEditorStore } from './store';

function TitleField({ stage, error }: { stage: DraftStage; error?: string }) {
  const updateStage = useQuestEditorStore((state) => state.updateStage);
  const object = useMapObject(stage.title.trim() ? null : stage.objectId);
  const suggestion = object.data?.name;
  return (
    <Field
      label="Какое это место"
      htmlFor="stage-title"
      hint="Игрок увидит название, только когда найдёт место"
      error={error}
    >
      <Input
        id="stage-title"
        value={stage.title}
        maxLength={120}
        invalid={Boolean(error)}
        placeholder="Лавка травника на Миллионке"
        onChange={(event) => updateStage(stage.id, { title: event.target.value })}
      />
      {suggestion && !stage.title.trim() && (
        <Chip
          icon={Sparkles}
          onClick={() => updateStage(stage.id, { title: suggestion })}
          className="self-start"
        >
          {suggestion}
        </Chip>
      )}
    </Field>
  );
}

function ZoneFields({ stage }: { stage: DraftStage }) {
  const updateStage = useQuestEditorStore((state) => state.updateStage);
  return (
    <Field
      label="Что подскажет карта"
      hint={
        stage.zone === 'circle'
          ? 'Игрок увидит круг, сдвинутый так, что место внутри, но центр его не выдаёт.'
          : 'Только текст загадки — без кругов на карте.'
      }
    >
      <SegmentedControl
        label="Что подскажет карта"
        value={stage.zone}
        onChange={(zone) => updateStage(stage.id, { zone })}
        options={[
          { value: 'riddle', label: 'Только загадка' },
          { value: 'circle', label: 'Примерный круг' },
        ]}
      />
      {stage.zone === 'circle' && (
        <div className="flex flex-wrap gap-1.5">
          {ZONE_OPTIONS.map((radius) => (
            <Chip
              key={radius}
              icon={CircleDashed}
              selected={stage.zoneRadiusM === radius}
              onClick={() => updateStage(stage.id, { zoneRadiusM: radius })}
            >
              {radius} м
            </Chip>
          ))}
        </div>
      )}
    </Field>
  );
}

/** Everything about one stage, applied live: the map shows the radius and the circle as you go. */
export function StageSheet() {
  const editingId = useQuestEditorStore((state) => state.editingId);
  const stages = useQuestEditorStore((state) => state.draft.stages);
  const allErrors = useQuestEditorStore((state) => state.errors.stage);
  const { updateStage, removeStage } = useQuestEditorStore.getState();
  const index = stages.findIndex((item) => item.id === editingId);
  const stage = index === -1 ? undefined : stages[index];
  const errors = (stage && allErrors?.[stage.id]) || {};

  const remove = (target: DraftStage, at: number) => {
    removeStage(target.id);
    toast.info(`Этап ${at + 1} удалён`, {
      label: 'Вернуть',
      onClick: () => useQuestEditorStore.getState().insertStage(target, at),
    });
  };

  return (
    <Modal
      open={Boolean(stage)}
      onClose={closeStageEditor}
      title={stage ? `Этап ${index + 1}` : ''}
      description="Загадка ведёт к месту; на месте игрок доказывает, что нашёл его."
      footer={
        stage && (
          <>
            <Button variant="secondary" icon={Trash2} onClick={() => remove(stage, index)}>
              Удалить
            </Button>
            <Button onClick={closeStageEditor}>Готово</Button>
          </>
        )
      }
    >
      {stage && (
        <div className="flex flex-col gap-4">
          <TitleField stage={stage} error={errors.title} />
          <Field
            label="Загадка"
            htmlFor="stage-riddle"
            hint="Как найти место — не называя его прямо"
            error={errors.riddle}
          >
            <Textarea
              id="stage-riddle"
              rows={4}
              maxLength={2000}
              value={stage.riddle}
              invalid={Boolean(errors.riddle)}
              placeholder="Там, где кончаются рельсы самой длинной дороги страны…"
              onChange={(event) => updateStage(stage.id, { riddle: event.target.value })}
            />
          </Field>
          <Field label="Фото к загадке" optional hint="Деталь, по которой место можно узнать">
            <PhotoPicker
              photos={stage.photo ? [stage.photo] : []}
              max={1}
              onChange={(photos) => updateStage(stage.id, { photo: photos[0] ?? null })}
            />
          </Field>
          <ConditionFields stage={stage} errors={errors} />
          <ZoneFields stage={stage} />
          <Field
            label="Подсказка"
            htmlFor="stage-hint"
            optional
            hint={`Игрок может открыть её за +${HINT_PENALTY_MIN} минут к времени`}
          >
            <Textarea
              id="stage-hint"
              rows={2}
              maxLength={1000}
              value={stage.hint}
              placeholder="Ищите арку рядом с вывеской с драконом"
              onChange={(event) => updateStage(stage.id, { hint: event.target.value })}
            />
          </Field>
          <Field
            label="История места"
            htmlFor="stage-reward"
            optional
            hint="Её прочитают, когда пройдут этап: чем это место интересно"
          >
            <Textarea
              id="stage-reward"
              rows={4}
              maxLength={3000}
              value={stage.reward}
              placeholder="Лавка стоит в этом дворе с девяностых…"
              onChange={(event) => updateStage(stage.id, { reward: event.target.value })}
            />
          </Field>
        </div>
      )}
    </Modal>
  );
}
