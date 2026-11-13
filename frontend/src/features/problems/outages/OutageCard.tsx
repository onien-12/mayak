import { Building2, Clock, Home, MessageSquareWarning, Users } from 'lucide-react';

import { usePlaceParam } from '@/features/map';
import type { PlaceDetail } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { pluralize, PLURALS } from '@/shared/lib/format';
import { OUTAGE_RESOURCE_META } from '@/shared/lib/labels';
import { TONES } from '@/shared/lib/tones';
import { Skeleton } from '@/shared/ui';

import { formatLasting, formatPlannedEnd } from './outageText';
import type { OutagePlace } from './useOutages';

const SEVERITY_ACCENT = {
  high: 'bg-issue',
  medium: 'bg-warning',
  low: 'bg-line',
} as const;

function Timing({ detail }: { detail: PlaceDetail | undefined }) {
  if (!detail?.issue) return <Skeleton className="h-4 w-40" />;
  const { detected_at: started, expected_fix_at: plannedEnd } = detail.issue;
  const end = plannedEnd ? formatPlannedEnd(plannedEnd) : null;
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-ink-soft">
      <Clock size={13} aria-hidden className="shrink-0 text-ink-faint" />
      <span>{formatLasting(started)}</span>
      <span aria-hidden>·</span>
      <span className={cn('font-medium', end?.overdue ? 'text-warning-ink' : 'text-ink')}>
        {end ? end.text : 'срок не назван'}
      </span>
    </p>
  );
}

interface OutageCardProps {
  place: OutagePlace;
  detail: PlaceDetail | undefined;
}

/**
 * One outage: what is off, how many houses, who is on it (or «по сообщениям жителей»), how
 * long it has lasted and until when. The left accent shows the severity.
 */
export function OutageCard({ place, detail }: OutageCardProps) {
  const { openPlace } = usePlaceParam();
  const outage = place.issue.outage;
  const meta = OUTAGE_RESOURCE_META[outage.resource];
  const Icon = meta.icon;
  const organisation = detail?.issue?.responsible_org;

  return (
    <article className="relative flex gap-3 overflow-hidden rounded-card border border-line/70 bg-surface p-3 pl-3.5 transition-[box-shadow,scale] duration-150 hover:shadow-card has-[h3>button:active]:scale-[0.98]">
      <span
        aria-hidden
        className={cn('absolute inset-y-0 left-0 w-1', SEVERITY_ACCENT[place.issue.severity])}
      />
      <span
        className={cn(
          'flex size-11 shrink-0 items-center justify-center rounded-xl',
          TONES[meta.tone].soft,
        )}
      >
        <Icon size={20} aria-hidden />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <h3 className="text-sm leading-snug font-semibold text-ink">
          <button
            type="button"
            onClick={() => openPlace(place.id)}
            className="line-clamp-2 text-left after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-brand"
          >
            {place.title}
          </button>
        </h3>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-soft">
          <span className="flex items-center gap-1 font-medium text-ink">
            <Home size={13} aria-hidden />
            {pluralize(outage.buildings_count, PLURALS.house)}
          </span>
          {outage.complaints_count > 0 && (
            <span className="flex items-center gap-1">
              <MessageSquareWarning size={13} aria-hidden />
              {pluralize(outage.complaints_count, PLURALS.complaint)}
            </span>
          )}
        </p>
        <div className="flex min-w-0 items-center gap-1 text-xs text-ink-soft">
          {place.issue.source === 'official' ? (
            <Building2 size={13} aria-hidden className="shrink-0 text-ink-faint" />
          ) : (
            <Users size={13} aria-hidden className="shrink-0 text-ink-faint" />
          )}
          {place.issue.source !== 'official' ? (
            <span className="truncate">По сообщениям жителей</span>
          ) : detail ? (
            <span className="truncate">{organisation ?? 'Служба не указана'}</span>
          ) : (
            <Skeleton className="h-3 w-36" />
          )}
        </div>
        <Timing detail={detail} />
      </div>
    </article>
  );
}
