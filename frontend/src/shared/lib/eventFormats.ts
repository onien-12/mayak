import { plural, pluralize, PLURALS } from './format';

/**
 * Formats residents arrange themselves (SPEC §3.4). They are ordinary categories on the server;
 * the slugs below change only the wording and which fields the form asks first.
 */
export const FORMAT_SLUGS = {
  /** «Раздача и барахолка» — event: things given away, participants may bring their own. */
  swap: 'swap',
  /** «Нужна помощь» — event: a small request a neighbour responds to; always a meetup. */
  help: 'help',
  /** «Площадка для встреч» — infrastructure: premises offered for meetups. */
  venue: 'venue',
} as const;

/** Facts of a giveaway and of a venue the card shows in a block of their own (and the form asks first). */
export const SWAP_FACTS: readonly string[] = ['offer', 'bring_own'];
export const VENUE_FACTS: readonly string[] = [
  'activities',
  'capacity',
  'free',
  'price',
  'booking',
  'hours',
];

/** How an event speaks about taking part: one does not «пойти» to help a neighbour. */
export interface EventWording {
  /** Badge of the format on the card; `null` for ordinary events. */
  badge: string | null;
  join: string;
  joined: string;
  joinedToast: string;
  leftToast: string;
  /** Who took part, without a capacity: «Идут: 3 участника». */
  going: (count: number) => string;
  /** Before «N из M». */
  ofCapacity: string;
  /** Seats left: «Осталось 2 места». */
  left: (count: number) => string;
  full: string;
  closed: string;
  contactLabel: string;
  contactHidden: string;
  openRegistration: string;
  closeRegistration: string;
  cancel: string;
  cancelled: string;
  /** Finishes «войдите, …». */
  authReason: string;
}

const HELPERS = ['помощник', 'помощника', 'помощников'] as const;

const EVENT: EventWording = {
  badge: null,
  join: 'Я пойду',
  joined: 'Вы идёте · отменить участие',
  joinedToast: 'Вы участвуете!',
  leftToast: 'Вы больше не участвуете',
  going: (count) => `Идут: ${pluralize(count, PLURALS.participant)}`,
  ofCapacity: 'Записались',
  left: (count) => `Осталось ${pluralize(count, PLURALS.seat)}`,
  full: 'Все места заняты',
  closed: 'Организатор закрыл запись',
  contactLabel: 'Контакт организатора',
  contactHidden: 'Контакт организатора увидят только участники встречи.',
  openRegistration: 'Открыть запись',
  closeRegistration: 'Закрыть запись',
  cancel: 'Отменить событие',
  cancelled: 'Событие отменено',
  authReason: 'чтобы записаться на событие',
};

const SWAP: EventWording = {
  ...EVENT,
  badge: 'Раздача',
  join: 'Я приду',
  joined: 'Вы придёте · отменить',
  going: (count) => `Придут: ${pluralize(count, PLURALS.participant)}`,
  contactHidden: 'Контакт организатора увидят только те, кто записался.',
  cancel: 'Отменить раздачу',
  cancelled: 'Раздача отменена',
};

const HELP: EventWording = {
  ...EVENT,
  badge: 'Нужна помощь',
  join: 'Помогу',
  joined: 'Вы откликнулись · отменить',
  joinedToast: 'Вы откликнулись — теперь вам виден контакт автора',
  leftToast: 'Отклик отменён',
  going: (count) => `Откликнулись: ${count}`,
  ofCapacity: 'Откликнулись',
  left: (count) => `${plural(count, ['Нужен', 'Нужно', 'Нужно'])} ещё ${pluralize(count, HELPERS)}`,
  full: 'Помощники нашлись',
  closed: 'Автор закрыл отклики',
  contactLabel: 'Контакт автора',
  contactHidden: 'Контакт автора увидят те, кто откликнулся.',
  openRegistration: 'Открыть отклики',
  closeRegistration: 'Закрыть отклики',
  cancel: 'Отменить просьбу',
  cancelled: 'Просьба отменена',
  authReason: 'чтобы откликнуться',
};

export function eventWording(slug: string | undefined): EventWording {
  if (slug === FORMAT_SLUGS.help) return HELP;
  if (slug === FORMAT_SLUGS.swap) return SWAP;
  return EVENT;
}
