import type {
  HeldKind,
  HoldSource,
  ModerationAction,
  ModerationCaseDetail,
  ModerationTrigger,
  PlaceStatus,
  RouteStatus,
} from '@/shared/api';

/** Why a case is in the queue, in plain words for the moderator. */
export const TRIGGER_EXPLANATIONS: Record<ModerationTrigger, string> = {
  premoderation: 'Автор — новичок: его публикации проверяются до появления на карте.',
  complaints: 'Жители пожаловались на публикацию, и вес жалоб превысил порог.',
  absent_votes: 'Несколько жителей отметили, что на месте этого нет.',
  auto_text:
    'Автопроверка нашла в тексте подозрительное: ссылки, капс, дубликат или набор случайных букв.',
  auto_image: 'Фото уже встречалось в других публикациях или не прошло проверку — каждое отдельно.',
  auto_ai: 'Нейросеть сочла публикацию подозрительной — её мнение ниже.',
  appeal: 'Автор не согласен с прошлым решением и подал апелляцию.',
  clarification:
    'Житель отметил «Требует уточнения» и написал, что не так. Публикация остаётся на карте.',
};

/** Short labels for the decision bar (full labels live in `MODERATION_ACTION_META`). */
export const ACTION_SHORT: Record<ModerationAction, string> = {
  approve: 'Одобрить',
  reject: 'Отклонить',
  request_changes: 'Правки',
  hide: 'Скрыть',
  restore: 'Вернуть',
  release: 'Выпустить',
  remove: 'Убрать',
};

/** One-tap reasons; the moderator can edit them before confirming. */
export const QUICK_REASONS: Record<ModerationAction, readonly string[]> = {
  approve: ['Информация подтверждается', 'Нарушений нет', 'Жалобы не подтвердились'],
  reject: [
    'Спам или реклама',
    'Недостоверная информация',
    'Дубликат существующей метки',
    'Нарушение правил сервиса',
  ],
  request_changes: [
    'Уточните точку на карте или адрес',
    'Добавьте понятное описание',
    'Уберите ссылки и контакты из текста',
    'Замените фото',
  ],
  hide: [
    'Места больше нет — подтверждено жителями',
    'Оскорбительное содержание',
    'Опасная или недостоверная информация',
  ],
  restore: ['Апелляция обоснована', 'Публикацию скрыли по ошибке', 'Информация снова актуальна'],
  release: ['Нарушений нет', 'Проверка ошиблась', 'Обычное фото места'],
  remove: ['Оскорбления', 'Реклама или спам', 'Непристойное фото', 'Личные данные'],
};

/** Who held an item quietly, in plain words. */
export const HOLD_SOURCE_LABELS: Record<HoldSource, string> = {
  heuristic: 'Набор случайных букв',
  ai: 'Проверка ИИ',
  standing: 'Проверка не состоялась, внутренняя оценка автора низкая',
};

export const HELD_KIND_LABELS: Record<HeldKind, string> = {
  photo: 'Фото',
  comment: 'Комментарий',
  review: 'Отзыв',
  note: 'Заметка',
};

/** Hidden author standing (SPEC §24.4): below this every doubt holds. */
export const STANDING_LOW = 30;

export const REASON_MIN = 3;
export const REASON_MAX = 1000;

type TargetStatus = PlaceStatus | RouteStatus;

function targetStatus(detail: ModerationCaseDetail): TargetStatus | null {
  return detail.place?.status ?? detail.route?.status ?? null;
}

/** Decisions that make sense for the current status of the publication (SPEC §7). Held photos,
 * comments, reviews and notes are decided in their own list, not here. */
export function availableActions(detail: ModerationCaseDetail): ModerationAction[] {
  if (detail.target_type !== 'place' && detail.target_type !== 'route') return [];
  switch (targetStatus(detail)) {
    case 'pending':
      return ['approve', 'request_changes', 'reject'];
    case 'hidden':
      return ['restore', 'reject'];
    case 'archived':
      return ['restore'];
    default:
      return ['approve', 'hide', 'reject'];
  }
}

/** Risk 0..100 → colour role. */
export function riskTone(risk: number): 'danger' | 'warning' | 'success' {
  if (risk >= 60) return 'danger';
  if (risk >= 30) return 'warning';
  return 'success';
}
