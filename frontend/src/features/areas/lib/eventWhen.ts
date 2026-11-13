import { formatTime } from '@/shared/lib/format';

const DAY_MS = 86_400_000;
const WEEK_DAYS = 7;
const weekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' });
const dayMonth = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** «сегодня, 18:00», «завтра, 12:00», «сб, 12:00» within a week, «28 нояб., 19:00» later. */
export function eventWhen(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const days = Math.round((startOfDay(date) - startOfDay(now)) / DAY_MS);
  const day =
    days <= 0
      ? 'сегодня'
      : days === 1
        ? 'завтра'
        : days < WEEK_DAYS
          ? weekday.format(date)
          : dayMonth.format(date);
  return `${day}, ${formatTime(iso)}`;
}
