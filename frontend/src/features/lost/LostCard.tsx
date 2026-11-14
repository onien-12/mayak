import type { LostItemCard } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { ListCard, ListMark, OnReviewMark } from '@/shared/ui';

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
    return <img src={item.cover_url} alt="" loading="lazy" className="size-full object-cover" />;
  }
  return (
    <span aria-hidden className="flex size-full items-center justify-center text-ink-soft">
      <Icon size={32} strokeWidth={1.6} />
    </span>
  );
}

interface LostCardProps {
  item: LostItemCard;
  /** Why it may be the same thing — for matches and search results. */
  reason?: string;
}

/**
 * One post in a list: photo or category icon, title, «when · what», found or lost. When it was
 * posted is on the post itself; the author's «на проверке» and a match reason go under the body.
 */
export function LostCard({ item, reason }: LostCardProps) {
  const category = LOST_CATEGORY_META[item.category].label;
  const notes = item.on_review || reason;
  return (
    <ListCard
      media={<Thumb item={item} />}
      title={item.title}
      to={`/lost/${item.id}`}
      meta={`${happenedLabel(item.kind, item.happened_on)} · ${category.toLowerCase()}`}
      marks={
        <>
          <KindBadge kind={item.kind} />
          {item.state !== 'active' && <ListMark>{LOST_STATE_LABELS[item.state]}</ListMark>}
        </>
      }
      footer={
        notes && (
          <>
            {item.on_review && <OnReviewMark />}
            {reason && <p className="text-sm font-medium text-success-ink">{reason}</p>}
          </>
        )
      }
    />
  );
}
