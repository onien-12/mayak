import { capitalize, formatDate } from '@/shared/lib/format';

import type { DayRange, EventsFilters, TimePreset } from './filtersStore';

const DAYS_IN_WEEK = 7;
const DAYS_IN_MONTH = 30;
const SATURDAY = 6;
const SUNDAY = 0;

type PeriodPreset = Exclude<TimePreset, 'custom'>;

/** Periods with a chip of their own in the quick row. */
export const QUICK_PERIODS: readonly { value: PeriodPreset; label: string }[] = [
  { value: 'any', label: 'Все даты' },
  { value: 'today', label: 'Сегодня' },
  { value: 'tomorrow', label: 'Завтра' },
];

/** Longer periods, offered inside the date picker; the «Даты» chip shows the chosen one. */
export const RANGE_PRESETS: readonly { value: PeriodPreset; label: string }[] = [
  { value: 'weekend', label: 'Выходные' },
  { value: 'week', label: 'Неделя' },
  { value: 'month', label: 'Месяц' },
];

function startOfDay(date: Date, shiftDays = 0): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + shiftDays);
}

/** End of the day `shiftDays` after `date`: 23:59:59.999 local time. */
function endOfDay(date: Date, shiftDays = 0): Date {
  return new Date(startOfDay(date, shiftDays + 1).getTime() - 1);
}

/** `YYYY-MM-DD` of a local date — the value of `<input type="date">`. */
export function toDayValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fromDayValue(value: string): Date {
  const [year = 0, month = 1, day = 1] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function weekend(now: Date): [Date, Date] {
  const weekday = now.getDay();
  if (weekday === SATURDAY) return [startOfDay(now), endOfDay(now, 1)];
  if (weekday === SUNDAY) return [startOfDay(now), endOfDay(now)];
  const toSaturday = SATURDAY - weekday;
  return [startOfDay(now, toSaturday), endOfDay(now, toSaturday + 1)];
}

/**
 * `from` / `to` of the chosen period (events overlapping it). Day-aligned, so the query key
 * stays the same for the whole day.
 */
export function periodBounds(
  filters: Pick<EventsFilters, 'time' | 'range'>,
  now = new Date(),
): { from?: string; to?: string } {
  const pair = ((): [Date, Date] | null => {
    switch (filters.time) {
      case 'today':
        return [startOfDay(now), endOfDay(now)];
      case 'tomorrow':
        return [startOfDay(now, 1), endOfDay(now, 1)];
      case 'weekend':
        return weekend(now);
      case 'week':
        return [startOfDay(now), endOfDay(now, DAYS_IN_WEEK - 1)];
      case 'month':
        return [startOfDay(now), endOfDay(now, DAYS_IN_MONTH - 1)];
      case 'custom':
        return filters.range
          ? [fromDayValue(filters.range.from), endOfDay(fromDayValue(filters.range.to))]
          : null;
      case 'any':
        return null;
    }
  })();
  return pair ? { from: pair[0].toISOString(), to: pair[1].toISOString() } : {};
}

const shortDayMonth = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });

/** «12–15 нояб.», «12 нояб.» — label of the custom period chip. */
export function formatRange(range: DayRange): string {
  const from = fromDayValue(range.from);
  const to = fromDayValue(range.to);
  if (range.from === range.to) return shortDayMonth.format(from);
  if (from.getMonth() === to.getMonth()) {
    return `${from.getDate()}–${shortDayMonth.format(to)}`;
  }
  return `${shortDayMonth.format(from)} – ${shortDayMonth.format(to)}`;
}

/** Lower-case name of the period for subtitles and empty states («на выходных»). */
export function periodPhrase(filters: Pick<EventsFilters, 'time' | 'range'>): string | null {
  switch (filters.time) {
    case 'today':
      return 'сегодня';
    case 'tomorrow':
      return 'завтра';
    case 'weekend':
      return 'на выходных';
    case 'week':
      return 'на этой неделе';
    case 'month':
      return 'в ближайший месяц';
    case 'custom':
      return filters.range ? formatRange(filters.range) : null;
    case 'any':
      return null;
  }
}

const weekdayLong = new Intl.DateTimeFormat('ru-RU', { weekday: 'long' });

/** Local day key `YYYY-MM-DD` used to group events by day. */
export function dayKey(iso: string): string {
  return toDayValue(new Date(iso));
}

/** Sticky header of a day group: «Сегодня», «Завтра, 12 ноября», «Суббота, 14 ноября». */
export function dayHeading(key: string, now = new Date()): string {
  const date = fromDayValue(key);
  const diff = Math.round((date.getTime() - startOfDay(now).getTime()) / 86_400_000);
  const day = formatDate(date.toISOString(), now);
  if (diff === 0) return 'Сегодня';
  if (diff === 1) return `Завтра, ${day}`;
  if (diff === -1) return `Вчера, ${day}`;
  return `${capitalize(weekdayLong.format(date))}, ${day}`;
}
