import type { LucideIcon } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import { Link, type To } from 'react-router';

import { cn } from '../lib/cn';
import { TONES, type Tone } from '../lib/tones';

interface ListCardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** Picture or its placeholder; fills the fixed square thumbnail. */
  media: ReactNode;
  title: ReactNode;
  /** Where the card leads (a link) … */
  to?: To;
  /** … or what a tap does (a button). One of the two. */
  onSelect?: () => void;
  /** Accessible name of the card's link when the title alone is not enough. */
  label?: string;
  /** The one line under the title: what it is, when, where. Cut to one line. */
  meta?: ReactNode;
  /** One or two marks that matter in a list: rating, price, stage… */
  marks?: ReactNode;
  /** A full-width line under the card body: the author's status, a match reason, an event inside. */
  footer?: ReactNode;
  /** A control of its own (remove from a list) in the top right corner, beside the title. */
  trailing?: ReactNode;
  /** One small control at the end of the marks row («show on the map»). */
  action?: ReactNode;
  /** Outlined: selected on the map, previewed. */
  highlight?: 'brand' | 'event' | false;
  /** Cancelled, finished: greyed picture and title. */
  muted?: boolean;
  /** Extra classes of the title text (e.g. a strike-through). */
  titleClassName?: string;
  /** Drafts and other work in progress: dashed border. */
  dashed?: boolean;
  /** Smaller square thumbnail for rows without pictures (drafts). */
  compact?: boolean;
}

/**
 * The one list card of the app (places, events, areas, routes, quests, lost posts): a square
 * picture, the name in up to two lines, one meta line and at most a couple of marks. The whole
 * card is one link or button named by the title; everything else lives on the item's own page.
 */
export function ListCard({
  media,
  title,
  to,
  onSelect,
  label,
  meta,
  marks,
  footer,
  trailing,
  action,
  highlight = false,
  muted = false,
  titleClassName,
  dashed = false,
  compact = false,
  className,
  ...rest
}: ListCardProps) {
  const overlay =
    'block text-left after:absolute after:inset-0 after:rounded-card focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-brand';
  const text = <span className={cn('line-clamp-2', titleClassName)}>{title}</span>;

  return (
    <article
      data-list-card
      className={cn(
        'relative flex flex-col gap-2.5 rounded-card border bg-surface p-3 transition-[border-color,box-shadow,scale] duration-150 has-[h3>:is(a,button):active]:scale-[0.98]',
        dashed && 'border-dashed',
        highlight === 'brand' && 'border-brand shadow-card',
        highlight === 'event' && 'border-event shadow-card ring-3 ring-event/15',
        !highlight &&
          (dashed
            ? 'border-ink-faint/50 hover:border-ink-faint'
            : 'border-line/70 hover:border-ink-faint/50 hover:shadow-card'),
        className,
      )}
      {...rest}
    >
      <div className="flex min-w-0 gap-3.5">
        <div
          className={cn(
            'relative shrink-0 self-start overflow-hidden rounded-control bg-canvas',
            compact ? 'size-12' : 'size-24',
            muted && 'opacity-60 grayscale',
          )}
        >
          {media}
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 py-0.5">
          <h3
            className={cn(
              'leading-6 font-semibold',
              compact ? 'text-base' : 'text-lg',
              muted ? 'text-ink-soft' : 'text-ink',
              trailing && 'pr-10',
            )}
          >
            {to !== undefined ? (
              <Link to={to} aria-label={label} className={overlay}>
                {text}
              </Link>
            ) : (
              <button type="button" onClick={onSelect} aria-label={label} className={overlay}>
                {text}
              </button>
            )}
          </h3>
          {meta && <p className="truncate text-[14px]/5 text-ink-soft">{meta}</p>}
          {(marks || action) && (
            <div className="mt-1.5 flex min-w-0 items-center gap-2 empty:hidden">
              {marks && (
                // One row: a mark that does not fit wraps out of sight whole instead of being cut.
                <div className="flex h-6 min-w-0 flex-1 flex-wrap items-center gap-x-3 overflow-hidden empty:hidden">
                  {marks}
                </div>
              )}
              {action && <div className="relative z-10 -my-1 ml-auto shrink-0">{action}</div>}
            </div>
          )}
        </div>
        {trailing && <div className="absolute top-2 right-2 z-10 flex">{trailing}</div>}
      </div>
      {footer && (
        <div className="relative flex min-w-0 flex-col items-start gap-1.5 border-t border-line/70 pt-2.5">
          {footer}
        </div>
      )}
    </article>
  );
}

interface ListMarkProps {
  icon?: LucideIcon;
  /** Colour of the icon only — the words stay calm. */
  tone?: Tone;
  /** Emphasised words (a price, a length): ink instead of soft ink. */
  strong?: boolean;
  title?: string;
  className?: string;
  children: ReactNode;
}

/** A quiet mark of a list card: an icon and a few words, no pill. */
export function ListMark({
  icon: Icon,
  tone,
  strong = false,
  title,
  className,
  children,
}: ListMarkProps) {
  return (
    <span
      title={title}
      className={cn(
        'flex max-w-full min-w-0 items-center gap-1 text-[14px]/5 whitespace-nowrap',
        strong ? 'font-semibold text-ink' : 'text-ink-soft',
        className,
      )}
    >
      {Icon && (
        <Icon
          size={15}
          aria-hidden
          className={cn('shrink-0', tone ? TONES[tone].text : 'text-ink-faint')}
        />
      )}
      <span className="truncate">{children}</span>
    </span>
  );
}
