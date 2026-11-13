import type { OutageResource, OutageSummary } from '@/shared/api';
import {
  formatDay,
  formatNumber,
  formatRelative,
  formatTime,
  plural,
  PLURALS,
} from '@/shared/lib/format';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** «без холодной воды» — what a house is left without, in the genitive. */
export const RESOURCE_GENITIVE: Record<OutageResource, string> = {
  cold_water: 'холодной воды',
  hot_water: 'горячей воды',
  heat: 'отопления',
  electricity: 'света',
};

/** «горячей воды, света и отопления». */
export function joinResources(resources: readonly OutageResource[]): string {
  const words = resources.map((resource) => RESOURCE_GENITIVE[resource]);
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} и ${words.at(-1)}`;
}

/** «уже 40 минут», «уже 3 часа», «уже 2 дня» — how long the outage has lasted. */
export function formatLasting(startIso: string, now = new Date()): string {
  const elapsed = Math.max(0, now.getTime() - new Date(startIso).getTime());
  if (elapsed < HOUR) {
    const minutes = Math.max(1, Math.round(elapsed / MINUTE));
    return `уже ${minutes} ${plural(minutes, PLURALS.minuteAcc)}`;
  }
  if (elapsed < DAY) {
    const hours = Math.round(elapsed / HOUR);
    return `уже ${hours} ${plural(hours, PLURALS.hour)}`;
  }
  const days = Math.round(elapsed / DAY);
  return `уже ${days} ${plural(days, PLURALS.day)}`;
}

export interface PlannedEnd {
  text: string;
  /** The planned time has passed and the outage is still listed. */
  overdue: boolean;
}

/** «до 16:00», «до завтра, 10:00», «обещали к 16:00» (overdue). */
export function formatPlannedEnd(endIso: string, now = new Date()): PlannedEnd {
  const end = new Date(endIso);
  const sameDay = end.toDateString() === now.toDateString();
  const when = sameDay ? formatTime(endIso) : `${formatDay(endIso, now)}, ${formatTime(endIso)}`;
  if (end.getTime() < now.getTime()) return { text: `обещали к ${when}`, overdue: true };
  return { text: `до ${when}`, overdue: false };
}

/** The importer refreshes every 20 minutes; older data is flagged as possibly stale. */
const STALE_AFTER_MS = 90 * MINUTE;

export function isStale(summary: OutageSummary, now = new Date()): boolean {
  if (summary.updated_at === null) return true;
  return now.getTime() - new Date(summary.updated_at).getTime() > STALE_AFTER_MS;
}

/** «1 234 адреса · обновлено 5 минут назад» — the panel subtitle while outages are shown. */
export function outagesSubtitle(summary: OutageSummary | undefined): string {
  if (!summary) return 'Вода, тепло и свет по данным VL.ru';
  return [
    `${formatNumber(summary.totals.buildings)} ${plural(summary.totals.buildings, PLURALS.address)}`,
    summary.updated_at && `обновлено ${formatRelative(summary.updated_at)}`,
  ]
    .filter(Boolean)
    .join(' · ');
}
