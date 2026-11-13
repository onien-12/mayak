import {
  ApiError,
  errorMessage,
  type Photo,
  type QuestCondition,
  type QuestEditor,
  type QuestInput,
  type QuestZone,
  type RouteVisibility,
} from '@/shared/api';
import type { LatLng } from '@/shared/lib/geo';

export const MIN_STAGES = 2;
export const MAX_STAGES = 20;
export const RADIUS_OPTIONS = [20, 40, 60, 100, 150, 200] as const;
export const ZONE_OPTIONS = [150, 250, 350, 500] as const;
export const DURATION_OPTIONS = [30, 60, 90, 120, 180, 240] as const;
export const DEFAULT_RADIUS = 40;
export const DEFAULT_ZONE = 250;

export interface DraftStage extends LatLng {
  /** Client-side key (stable across reorders). */
  id: string;
  /** The 2GIS object under the tap that placed the stage: suggests its name. */
  objectId: string | null;
  /** The saved stage this is (players' progress follows it through reorders and edits). */
  serverId: number | null;
  title: string;
  placeId: number | null;
  riddle: string;
  photo: Photo | null;
  condition: QuestCondition;
  /** For a code or an answer: the player must also be on site. */
  checkArrival: boolean;
  radiusM: number;
  code: string;
  question: string;
  answers: string[];
  hint: string;
  reward: string;
  zone: QuestZone;
  zoneRadiusM: number;
}

export interface QuestDraft {
  title: string;
  description: string;
  startTitle: string;
  start: LatLng | null;
  durationMin: number;
  cover: Photo | null;
  stages: DraftStage[];
}

export type StageField = 'title' | 'riddle' | 'code' | 'question' | 'answers' | 'point';
export interface DraftErrors {
  title?: string;
  startTitle?: string;
  start?: string;
  description?: string;
  /** About the list as a whole. */
  stages?: string;
  /** Per stage id. */
  stage?: Record<string, Partial<Record<StageField, string>>>;
}

let counter = 0;
const nextId = () => {
  counter += 1;
  return `stage-${Date.now().toString(36)}-${counter}`;
};

export function emptyDraft(): QuestDraft {
  return {
    title: '',
    description: '',
    startTitle: '',
    start: null,
    durationMin: 60,
    cover: null,
    stages: [],
  };
}

export function createStage(point: LatLng, fields: Partial<DraftStage> = {}): DraftStage {
  return {
    id: nextId(),
    lat: point.lat,
    lng: point.lng,
    objectId: null,
    serverId: null,
    title: '',
    placeId: null,
    riddle: '',
    photo: null,
    condition: 'arrival',
    checkArrival: false,
    radiusM: DEFAULT_RADIUS,
    code: '',
    question: '',
    answers: [],
    hint: '',
    reward: '',
    zone: 'riddle',
    zoneRadiusM: DEFAULT_ZONE,
    ...fields,
  };
}

export function draftFromQuest(quest: QuestEditor): QuestDraft {
  return {
    title: quest.title,
    description: quest.description,
    startTitle: quest.start.title,
    start: { lat: quest.start.lat, lng: quest.start.lng },
    durationMin: quest.duration_min,
    cover: quest.cover_photo,
    stages: quest.stages.map((stage) =>
      createStage(stage, {
        serverId: stage.id,
        title: stage.title,
        placeId: stage.place_id,
        riddle: stage.riddle,
        photo: stage.photo,
        condition: stage.condition,
        checkArrival: stage.condition !== 'arrival' && stage.check_arrival,
        radiusM: stage.radius_m,
        code: stage.condition === 'code' ? (stage.answers[0] ?? '') : '',
        question: stage.question,
        answers: stage.condition === 'answer' ? stage.answers : [],
        hint: stage.hint,
        reward: stage.reward,
        zone: stage.zone,
        zoneRadiusM: stage.zone_radius_m ?? DEFAULT_ZONE,
      }),
    ),
  };
}

function stageErrors(stage: DraftStage): Partial<Record<StageField, string>> {
  const errors: Partial<Record<StageField, string>> = {};
  if (stage.title.trim().length < 2)
    errors.title = 'Назовите место — игрок увидит название, когда найдёт его';
  if (stage.riddle.trim().length < 5) errors.riddle = 'Напишите загадку — как найти это место';
  if (stage.condition === 'code' && !stage.code.trim())
    errors.code = 'Укажите код, который игрок получит на месте';
  if (stage.condition === 'answer') {
    if (!stage.question.trim())
      errors.question = 'Напишите вопрос, на который игрок ответит на месте';
    if (stage.answers.every((answer) => !answer.trim()))
      errors.answers = 'Добавьте хотя бы один правильный ответ';
  }
  return errors;
}

/** Plain-language problems that would stop the save; empty when the draft can be sent. */
export function validateDraft(draft: QuestDraft): DraftErrors {
  const errors: DraftErrors = {};
  if (draft.title.trim().length < 3) errors.title = 'Название — от 3 символов';
  if (draft.startTitle.trim().length < 3)
    errors.startTitle = 'Подскажите, где собраться: «у входа в ГУМ со Светланской»';
  if (!draft.start)
    errors.start = 'Отметьте старт на карте: инструмент «Старт», затем нажмите на карту';
  if (draft.stages.length < MIN_STAGES)
    errors.stages = `В квесте должно быть хотя бы ${MIN_STAGES} этапа`;
  const stage: DraftErrors['stage'] = {};
  for (const item of draft.stages) {
    const found = stageErrors(item);
    if (Object.keys(found).length > 0) stage[item.id] = found;
  }
  if (Object.keys(stage).length > 0) {
    errors.stage = stage;
    errors.stages ??= 'Некоторые этапы не дописаны — они отмечены в списке';
  }
  return errors;
}

export function hasStageProblems(errors: DraftErrors): boolean {
  return Boolean(errors.stages || errors.stage);
}

export function toQuestInput(draft: QuestDraft, visibility: RouteVisibility): QuestInput {
  const start = draft.start ?? { lat: 0, lng: 0 };
  return {
    title: draft.title.trim(),
    description: draft.description.trim(),
    start_title: draft.startTitle.trim(),
    start_lat: start.lat,
    start_lng: start.lng,
    duration_min: draft.durationMin,
    cover_photo_id: draft.cover?.id ?? null,
    visibility,
    stages: draft.stages.map((stage) => ({
      id: stage.serverId,
      title: stage.title.trim(),
      lat: stage.lat,
      lng: stage.lng,
      place_id: stage.placeId,
      riddle: stage.riddle.trim(),
      photo_id: stage.photo?.id ?? null,
      condition: stage.condition,
      check_arrival: stage.condition === 'arrival' || stage.checkArrival,
      radius_m: stage.radiusM,
      question: stage.condition === 'answer' ? stage.question.trim() : '',
      answers:
        stage.condition === 'code'
          ? [stage.code.trim()]
          : stage.condition === 'answer'
            ? stage.answers.map((answer) => answer.trim()).filter(Boolean)
            : [],
      hint: stage.hint.trim(),
      reward: stage.reward.trim(),
      zone: stage.zone,
      zone_radius_m: stage.zone === 'circle' ? stage.zoneRadiusM : null,
    })),
  };
}

const META_FIELDS: Record<string, keyof DraftErrors> = {
  title: 'title',
  description: 'description',
  start_title: 'startTitle',
  start_lat: 'start',
  start_lng: 'start',
};
const STAGE_FIELDS: Record<string, StageField> = {
  title: 'title',
  riddle: 'riddle',
  question: 'question',
  answers: 'answers',
  lat: 'point',
  lng: 'point',
};

/** Where a stage-level message (no field named) belongs: the condition's own parameters. */
const CONDITION_FIELD: Record<QuestCondition, StageField> = {
  arrival: 'riddle',
  code: 'code',
  answer: 'question',
};

/** Server validation errors mapped onto the draft (`stages.2.riddle` → that stage's riddle). */
export function serverErrors(
  error: unknown,
  draft: QuestDraft,
): { errors: DraftErrors; message: string } {
  const errors: DraftErrors = {};
  if (!(error instanceof ApiError) || error.errors.length === 0) {
    return { errors, message: errorMessage(error) };
  }
  const stage: NonNullable<DraftErrors['stage']> = {};
  for (const { field, message } of error.errors) {
    const [head, index, key] = field.split('.');
    if (head === 'stages' && index !== undefined) {
      const item = draft.stages[Number(index)];
      if (!item) continue;
      const target = (key && STAGE_FIELDS[key]) || CONDITION_FIELD[item.condition];
      stage[item.id] = { ...stage[item.id], [target]: message };
    } else if (head === 'stages') {
      errors.stages = message;
    } else if (head && META_FIELDS[head]) {
      Object.assign(errors, { [META_FIELDS[head]]: message });
    }
  }
  if (Object.keys(stage).length > 0) {
    errors.stage = stage;
    errors.stages ??= 'Некоторые этапы не прошли проверку — они отмечены в списке';
  }
  return { errors, message: error.detail };
}
