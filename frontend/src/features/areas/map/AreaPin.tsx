import { Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { memo } from 'react';

import type { AreaCard } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { formatNumber } from '@/shared/lib/format';
import { AREA_KIND_META } from '@/shared/lib/labels';
import { SPRING } from '@/shared/ui';

import { shownInterest } from '../lib/interest';

/**
 * `full` — the zoomed-out hero: kind icon, name, count. `dot` — the same area squeezed out
 * by a more interesting neighbour. `label` — places are unfolded, only a small name tag.
 */
export type AreaPinVariant = 'full' | 'dot' | 'label';

interface AreaPinProps {
  area: AreaCard;
  variant: AreaPinVariant;
  selected: boolean;
  /** Called with the area id (a stable callback keeps the memoised pin from re-rendering). */
  onOpen: (areaId: number) => void;
  /** Smaller pill for the zoomed-out city view. */
  compact?: boolean;
  /** Shift of the marker from the area's point, px (collision layout). */
  dx?: number;
  dy?: number;
  /** Recommended to the viewer («Для вас»): a beam sparkle badge on the tile. */
  recommended?: boolean;
}

const TOP_TIER = 3;

/** Tile in the interest colour with the kind icon. */
function KindTile({
  area,
  size,
  recommended,
}: {
  area: AreaCard;
  size: number;
  recommended: boolean;
}) {
  const Icon = AREA_KIND_META[area.kind].icon;
  const { tier } = shownInterest(area);
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, background: tier.color }}
      className={cn(
        'relative flex shrink-0 items-center justify-center rounded-full',
        tier.tier === TOP_TIER ? 'text-brand' : 'text-white',
      )}
    >
      <Icon size={Math.round(size * 0.55)} strokeWidth={2.2} />
      {recommended && (
        <span className="absolute -top-1 -left-1 flex size-3.5 items-center justify-center rounded-full border border-white bg-brand text-beam">
          <Sparkles size={8} strokeWidth={2.8} />
        </span>
      )}
    </span>
  );
}

/**
 * Map marker of an area. Deliberately bigger than a place pin: a rounded pill instead of a
 * teardrop, tinted by the interest tier; the most interesting areas are navy with a beam
 * tile. Centred on the area's label point. Memoised: the area layer re-renders with every
 * viewport change.
 */
export const AreaPin = memo(function AreaPin({
  area,
  variant,
  selected,
  onOpen,
  compact = false,
  dx = 0,
  dy = 0,
  recommended = false,
}: AreaPinProps) {
  const interest = shownInterest(area);
  const top = interest.tier.tier === TOP_TIER;
  const label = [
    `${area.title}: ${AREA_KIND_META[area.kind].label.toLowerCase()}, мест — ${area.places_count}.`,
    `${interest.tier.label}${interest.personal ? ' для вас' : ''}.`,
    recommended && 'Рекомендуем вам.',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="relative size-0">
      <motion.button
        type="button"
        aria-label={label}
        aria-pressed={selected}
        onClick={() => onOpen(area.id)}
        key={variant}
        initial={{ opacity: 0, scale: 0.7, x: dx, y: dy }}
        animate={{ opacity: 1, scale: selected ? 1.08 : 1, x: dx, y: dy }}
        transition={SPRING.pop}
        whileTap={{ scale: 0.94 }}
        className={cn(
          'absolute top-0 left-0 flex -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center whitespace-nowrap shadow-float',
          'border border-white/80 transition-colors duration-150',
          variant === 'full' &&
            (compact
              ? 'h-8 gap-1.5 rounded-full py-0.5 pr-1 pl-0.5 text-xs font-semibold'
              : 'h-10 gap-2 rounded-full py-1 pr-1.5 pl-1 text-sm font-semibold'),
          variant === 'label' &&
            'h-7 gap-1.5 rounded-full py-0.5 pr-2.5 pl-0.5 text-xs font-semibold',
          variant === 'dot' && 'rounded-full p-0.5',
          selected || (top && variant !== 'label')
            ? 'bg-brand text-white'
            : 'bg-surface/95 text-ink',
          selected && 'ring-4 ring-beam/80',
        )}
      >
        <KindTile
          area={area}
          size={variant === 'label' || compact ? 24 : 30}
          recommended={recommended}
        />
        {variant !== 'dot' && (
          <span className={cn('truncate', compact ? 'max-w-36' : 'max-w-44')}>{area.title}</span>
        )}
        {variant === 'full' && (
          <span
            className={cn(
              'flex items-center justify-center rounded-full font-bold tabular-nums',
              compact ? 'h-[22px] min-w-[22px] px-1 text-[11px]' : 'h-7 min-w-7 px-1.5 text-xs',
              top ? 'bg-white/15 text-white' : 'bg-canvas text-ink',
            )}
          >
            {formatNumber(area.places_count)}
          </span>
        )}
      </motion.button>
    </div>
  );
});
