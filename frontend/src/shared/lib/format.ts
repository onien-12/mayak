import type { PhotoCredit } from '../api/types';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

type PluralForms = readonly [one: string, few: string, many: string];

/** Russian plural form: `plural(3, ['место', 'места', 'мест'])` → «места». */
export function plural(count: number, forms: PluralForms): string {
  const n = Math.abs(count) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return forms[2];
  if (n1 > 1 && n1 < 5) return forms[1];
  if (n1 === 1) return forms[0];
  return forms[2];
}

/** `pluralize(3, ['место', 'места', 'мест'])` → «3 места». */
export function pluralize(count: number, forms: PluralForms): string {
  return `${formatNumber(count)} ${plural(count, forms)}`;
}

export const PLURALS = {
  place: ['место', 'места', 'мест'],
  topic: ['тема', 'темы', 'тем'],
  event: ['событие', 'события', 'событий'],
  publicationAcc: ['публикацию', 'публикации', 'публикаций'],
  review: ['отзыв', 'отзыва', 'отзывов'],
  rating: ['оценка', 'оценки', 'оценок'],
  comment: ['комментарий', 'комментария', 'комментариев'],
  vote: ['голос', 'голоса', 'голосов'],
  confirmation: ['подтверждение', 'подтверждения', 'подтверждений'],
  participant: ['участник', 'участника', 'участников'],
  seat: ['место', 'места', 'мест'],
  photo: ['фото', 'фото', 'фото'],
  minute: ['минута', 'минуты', 'минут'],
  minuteAcc: ['минуту', 'минуты', 'минут'],
  hour: ['час', 'часа', 'часов'],
  day: ['день', 'дня', 'дней'],
  week: ['неделя', 'недели', 'недель'],
  weekAcc: ['неделю', 'недели', 'недель'],
  month: ['месяц', 'месяца', 'месяцев'],
  year: ['год', 'года', 'лет'],
  stop: ['остановка', 'остановки', 'остановок'],
  route: ['маршрут', 'маршрута', 'маршрутов'],
  result: ['результат', 'результата', 'результатов'],
  notification: ['уведомление', 'уведомления', 'уведомлений'],
  point: ['балл', 'балла', 'баллов'],
  address: ['адрес', 'адреса', 'адресов'],
  house: ['дом', 'дома', 'домов'],
  complaint: ['жалоба', 'жалобы', 'жалоб'],
  street: ['улица', 'улицы', 'улиц'],
  collection: ['подборка', 'подборки', 'подборок'],
  outage: ['отключение', 'отключения', 'отключений'],
  area: ['локация', 'локации', 'локаций'],
  issue: ['проблема', 'проблемы', 'проблем'],
} as const satisfies Record<string, PluralForms>;

const numberFormat = new Intl.NumberFormat('ru-RU');
const compactFormat = new Intl.NumberFormat('ru-RU', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

/** Short counts for tight spots: «950», «3,6 тыс.», «1,2 млн». */
export function formatCompact(value: number): string {
  return compactFormat.format(value);
}

/** A star rating with one decimal and a Russian comma: «4,6». */
export function formatRating(value: number): string {
  return value.toFixed(1).replace('.', ',');
}

/**
 * Event price: the free-form note when present («от 1500 до 3000 ₽»), «Бесплатно» for 0,
 * «1 200 ₽» for a number, «Цена не указана» when unknown (`null` is never "free").
 */
export function formatPrice(price: number | null, note?: string | null): string {
  if (note) return note;
  if (price === null) return 'Цена не указана';
  return price > 0 ? `${formatNumber(price)} ₽` : 'Бесплатно';
}

/** «350 м», «1,2 км», «14 км». */
export function formatDistance(meters: number): string {
  if (meters < 950) return `${Math.max(10, Math.round(meters / 10) * 10)} м`;
  const km = meters / 1000;
  return `${km < 10 ? km.toFixed(1).replace('.', ',') : Math.round(km)} км`;
}

/** «45 мин», «2 ч», «2 ч 30 мин». */
export function formatDuration(minutes: number): string {
  const total = Math.max(1, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} мин`;
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`;
}

const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
const dayMonthFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
const dayMonthYearFormat = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const weekdayFormat = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' });

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function dayDiff(date: Date, now: Date): number {
  return Math.round((startOfDay(date) - startOfDay(now)) / DAY);
}

export function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}

/** «12 ноября» (current year) or «12 ноября 2025 г.». */
export function formatDate(iso: string, now = new Date()): string {
  const date = new Date(iso);
  return date.getFullYear() === now.getFullYear()
    ? dayMonthFormat.format(date)
    : dayMonthYearFormat.format(date);
}

/** «сегодня», «завтра», «вчера», «сб, 15 ноября». */
export function formatDay(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const diff = dayDiff(date, now);
  if (diff === 0) return 'сегодня';
  if (diff === 1) return 'завтра';
  if (diff === -1) return 'вчера';
  return `${weekdayFormat.format(date)}, ${formatDate(iso, now)}`;
}

/** «сегодня в 18:00», «завтра в 10:30», «сб, 15 ноября в 12:00». */
export function formatDateTime(iso: string, now = new Date()): string {
  return `${formatDay(iso, now)} в ${formatTime(iso)}`;
}

/**
 * Past and future relative time: «только что», «5 минут назад», «через 2 часа»,
 * «3 дня назад»; falls back to a date beyond ~a month.
 */
export function formatRelative(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const diff = date.getTime() - now.getTime();
  const abs = Math.abs(diff);
  const wrap = (value: string) => (diff < 0 ? `${value} назад` : `через ${value}`);

  if (abs < MINUTE) return diff < 0 ? 'только что' : 'сейчас';
  if (abs < HOUR) {
    const n = Math.round(abs / MINUTE);
    return wrap(`${n} ${plural(n, PLURALS.minuteAcc)}`);
  }
  if (abs < DAY) {
    const n = Math.round(abs / HOUR);
    return wrap(`${n} ${plural(n, PLURALS.hour)}`);
  }
  const days = Math.abs(dayDiff(date, now));
  if (days === 1) return diff < 0 ? 'вчера' : 'завтра';
  if (days < 7) return wrap(`${days} ${plural(days, PLURALS.day)}`);
  if (days < 31) {
    const n = Math.round(days / 7);
    return wrap(`${n} ${plural(n, PLURALS.weekAcc)}`);
  }
  if (days < 365) {
    const n = Math.round(days / 30.4);
    return wrap(`${n} ${plural(n, PLURALS.month)}`);
  }
  return formatDate(iso, now);
}

/**
 * Humanised event interval: «сегодня, 18:00–21:00», «сб, 15 ноября, 12:00 — вс, 16 ноября, 20:00».
 */
export function formatEventRange(startIso: string, endIso: string, now = new Date()): string {
  // Exhibitions and festivals imported as 00:00 – 23:59 (or midnight) read better as dates.
  const endTime = formatTime(endIso);
  if (formatTime(startIso) === '00:00' && (endTime === '23:59' || endTime === '00:00')) {
    const lastDay =
      endTime === '00:00' ? new Date(new Date(endIso).getTime() - 60_000).toISOString() : endIso;
    return startOfDay(new Date(startIso)) >= startOfDay(new Date(lastDay))
      ? `${formatDay(startIso, now)}, весь день`
      : `${formatDay(startIso, now)} — ${formatDay(lastDay, now)}`;
  }
  const sameDay = startOfDay(new Date(startIso)) === startOfDay(new Date(endIso));
  if (sameDay) {
    return `${formatDay(startIso, now)}, ${formatTime(startIso)}–${formatTime(endIso)}`;
  }
  return `${formatDay(startIso, now)}, ${formatTime(startIso)} — ${formatDay(endIso, now)}, ${formatTime(endIso)}`;
}

/** Value for `<input type="datetime-local">` in the local time zone. */
export function toLocalInputValue(iso: string | Date): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Parses `<input type="datetime-local">` / `<input type="date">` value into ISO UTC. */
export function fromLocalInputValue(value: string): string {
  return new Date(value).toISOString();
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** «Фото: Алексей Кондратюк, CC BY-SA 3.0» — the credit of an external photo as plain text. */
export function formatPhotoCredit(credit: PhotoCredit): string {
  return `Фото: ${credit.author}, ${credit.license}`;
}
