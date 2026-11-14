import { Link } from 'react-router';

import type { LostItemCard } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { formatRelative } from '@/shared/lib/format';
import { OnReviewMark } from '@/shared/ui';

import { happenedLabel, LOST_CATEGORY_META, LOST_KIND_META, LOST_STATE_LABELS } from './lostMeta';

/** «Нашли» / «Потеряли» as a small tinted label. */
export function KindBadge({ kind, className }: { kind: LostItemCard['kind']; className?: string }) {
  const meta = LOST_KIND_META[kind];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-semibold',
        meta.soft,
        className,
      )}
    >
      <Icon size={13} aria-hidden />
      {meta.label}
    </span>
  );
}

function Thumb({ item }: { item: LostItemCard }) {
  const Icon = LOST_CATEGORY_META[item.category].icon;
  if (item.cover_url) {
    return (
      <img
        src={item.cover_url}
        alt=""
        loading="lazy"
        className="size-16 shrink-0 rounded-control bg-canvas object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex size-16 shrink-0 items-center justify-center rounded-control bg-canvas text-ink-soft"
    >
      <Icon size={26} />
    </span>
  );
}

interface LostCardProps {
  item: LostItemCard;
  /** Why it may be the same thing — for matches and search results. */
  reason?: string;
}

/** One post in a list: photo or category icon, kind, title, what and when. */
export function LostCard({ item, reason }: LostCardProps) {
  const category = LOST_CATEGORY_META[item.category].label;
  return (
    <Link
      to={`/lost/${item.id}`}
      className="flex gap-3 rounded-card border border-line/70 bg-surface p-2.5 transition-colors hover:border-ink-faint/50 hover:bg-canvas/50"
    >
      <Thumb item={item} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <KindBadge kind={item.kind} />
          {item.state !== 'active' && (
            <span className="truncate text-xs text-ink-faint">{LOST_STATE_LABELS[item.state]}</span>
          )}
        </span>
        <span className="line-clamp-2 text-sm leading-snug font-semibold text-ink">
          {item.title}
        </span>
        <span className="truncate text-xs text-ink-soft">
          {category} · {happenedLabel(item.kind, item.happened_on).toLowerCase()} ·{' '}
          {formatRelative(item.created_at)}
        </span>
        {/* On its own line: the mark is longer than the room next to the kind badge. */}
        {item.on_review && <OnReviewMark className="self-start" />}
        {reason && <span className="text-xs font-medium text-success-ink">{reason}</span>}
      </span>
    </Link>
  );
}
