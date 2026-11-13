import type { RatingSource } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { LogoMark } from '@/shared/ui';

import { SOURCE_LOOKS } from './sources';

interface SourceMarkProps {
  source: RatingSource;
  size?: number;
  /** Decorative next to a visible label; named when it is the only sign of the source. */
  labelled?: boolean;
  className?: string;
}

/**
 * A round mark telling at a glance where a review or a rating came from: the lighthouse for
 * «Маяк», the service's monogram for the others.
 */
export function SourceMark({ source, size = 20, labelled = false, className }: SourceMarkProps) {
  const look = SOURCE_LOOKS[source];
  const a11y = {
    role: labelled ? 'img' : undefined,
    'aria-label': labelled ? `Отзыв из ${look.from}` : undefined,
    'aria-hidden': labelled ? undefined : true,
  };
  if (source === 'mayak') {
    return (
      <span {...a11y} className={cn('inline-flex shrink-0', className)}>
        <LogoMark size={size} round />
      </span>
    );
  }
  return (
    <span
      {...a11y}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.58) }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full leading-none font-bold select-none',
        look.className,
        className,
      )}
    >
      {look.letter}
    </span>
  );
}
