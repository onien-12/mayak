import type { EventBrief } from '@/shared/api';
import { capitalize, formatDay, formatTime } from '@/shared/lib/format';

import { dayKey } from './period';

const shortDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });

/** «до 30 нояб.» — compact end of a long-running event. */
const until = (iso: string) => `до ${shortDate.format(new Date(iso))}`;

/** Imported events without a session time start at local midnight. */
const hasTime = (iso: string) => {
  const date = new Date(iso);
  return date.getHours() !== 0 || date.getMinutes() !== 0;
};

/**
 * Humanised time of an event card.
 * Inside a day group (`withDate = false`): «18:00–21:00», «Весь день», «18:00 · до 15 нояб.».
 * In a flat list: «Сегодня, 18:00–21:00», «Сб, 15 ноября, 12:00 · до 30 нояб.».
 */
export function eventTimeLabel(event: EventBrief, withDate: boolean, now = new Date()): string {
  const sameDay = dayKey(event.starts_at) === dayKey(event.ends_at);
  const timed = hasTime(event.starts_at);

  if (event.phase === 'ongoing') {
    return sameDay ? `до ${formatTime(event.ends_at)}` : until(event.ends_at);
  }
  const hours = timed ? `${formatTime(event.starts_at)}–${formatTime(event.ends_at)}` : null;
  if (withDate) {
    const day = capitalize(formatDay(event.starts_at, now));
    if (sameDay) return hours ? `${day}, ${hours}` : day;
    return `${timed ? `${day}, ${formatTime(event.starts_at)}` : day} · ${until(event.ends_at)}`;
  }
  if (sameDay) return hours ?? 'Весь день';
  const end = until(event.ends_at);
  return timed ? `${formatTime(event.starts_at)} · ${end}` : capitalize(end);
}
