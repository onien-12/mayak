import { useEffect, useRef, useState } from 'react';

import { cn } from '@/shared/lib/cn';
import { formatDate, formatRelative } from '@/shared/lib/format';
import { OnReviewMark, RatingStars, StaggerItem, UserChip } from '@/shared/ui';

import type { FeedEntry } from './feed';
import { SourceMark } from './SourceMark';

interface ReviewCardProps {
  entry: FeedEntry;
  /** Position within the page just shown — drives the staggered entrance. */
  index: number;
  /** The signed-in user's own review. */
  mine?: boolean;
}

/** Text clamped to five lines with «Читать полностью» when it overflows. */
function ClampedText({ text }: { text: string }) {
  const textRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const element = textRef.current;
    if (!element || expanded) return;
    const observer = new ResizeObserver(() =>
      setOverflows(element.scrollHeight > element.clientHeight + 1),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [expanded]);

  return (
    <>
      <p
        ref={textRef}
        className={cn(
          'text-sm break-words whitespace-pre-line text-ink',
          !expanded && 'line-clamp-5',
        )}
      >
        {text}
      </p>
      {(overflows || expanded) && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="tap-target relative self-start text-sm font-semibold text-brand hover:underline"
        >
          {expanded ? 'Свернуть' : 'Читать полностью'}
        </button>
      )}
    </>
  );
}

/**
 * One review as a card of its own, marked with where it came from: ours carry the author,
 * the others stay anonymous (stars, date, text).
 */
export function ReviewCard({ entry, index, mine = false }: ReviewCardProps) {
  const { review } = entry;
  return (
    <StaggerItem
      index={index}
      className={cn(
        'flex min-w-0 flex-col gap-2 rounded-card border bg-surface p-3.5',
        mine ? 'border-brand/25' : 'border-line',
      )}
    >
      {entry.kind === 'own' ? (
        <div className="flex items-center gap-2">
          <SourceMark source="mayak" labelled />
          <UserChip
            user={entry.review.author}
            size="sm"
            showLevel={false}
            caption={`${mine ? 'Ваш отзыв · ' : ''}${formatRelative(entry.review.created_at)}`}
            className="min-w-0 flex-1"
          />
          <RatingStars value={entry.review.rating} size={13} className="shrink-0" />
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <SourceMark source={entry.origin} labelled />
          {entry.review.rating !== null && <RatingStars value={entry.review.rating} size={13} />}
          {entry.review.published_at && (
            <time dateTime={entry.review.published_at} className="ml-auto text-xs text-ink-faint">
              {formatDate(entry.review.published_at)}
            </time>
          )}
        </div>
      )}
      {review.text && <ClampedText text={review.text} />}
      {entry.kind === 'own' && entry.review.on_review && <OnReviewMark className="self-start" />}
    </StaggerItem>
  );
}
