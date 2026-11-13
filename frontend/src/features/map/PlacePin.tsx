import { Check, Clock, ShieldCheck, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { memo, type CSSProperties, type ReactNode } from 'react';

import type { PlaceCard } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { LAYER_META } from '@/shared/lib/labels';
import { isUnconfirmedOsm } from '@/shared/lib/osm';
import { CategoryGlyph, SPRING } from '@/shared/ui';

import { PIN_HEIGHT, PIN_PATH, PIN_WIDTH } from './pin';

const PENDING_COLOR = '#8A99AB';
const SELECTED_SCALE = 1.3;
/** Unconfirmed OpenStreetMap objects: a smaller, lighter background pin. */
const BACKGROUND_SCALE = 0.82;

interface PlacePinProps {
  place: PlaceCard;
  /** Category slug for the glyph. */
  slug: string | undefined;
  selected: boolean;
  /** Non-interactive and faded (while another map mode is active). */
  dimmed?: boolean;
  /** Recommended to the viewer («Для вас»): a soft navy halo and a beam sparkle badge. */
  recommended?: boolean;
}

function Corner({
  side,
  className,
  children,
}: {
  side: 'left' | 'right';
  className: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'absolute top-0 flex size-4 items-center justify-center rounded-full border-[1.5px] border-white text-white',
        side === 'right' ? 'right-0.5' : 'left-0.5',
        className,
      )}
    >
      {children}
    </span>
  );
}

function StatusCorner({ place }: { place: PlaceCard }) {
  switch (place.status) {
    case 'verified':
      return (
        <Corner side="right" className="bg-success">
          <Check size={10} strokeWidth={3.5} />
        </Corner>
      );
    case 'needs_review':
      return (
        <Corner side="right" className="bg-warning text-[10px] leading-none font-bold text-ink">
          !
        </Corner>
      );
    case 'pending':
      return (
        <Corner side="right" className="bg-ink-soft">
          <Clock size={10} strokeWidth={3} />
        </Corner>
      );
    default:
      return null;
  }
}

/**
 * Map marker of a place. Layer colour + category glyph; the verification state is readable
 * at a glance: solid = confirmed, dashed outline = unverified, corner badges for
 * verified / needs review / pending / official info. OpenStreetMap objects nobody has
 * confirmed yet are a small white background pin. Memoised: the marker layer re-renders all
 * pins whenever the selection or the scene changes, while each pin's props rarely do.
 */
export const PlacePin = memo(function PlacePin({
  place,
  slug,
  selected,
  dimmed = false,
  recommended = false,
}: PlacePinProps) {
  const pending = place.status === 'pending';
  const dashed = place.status === 'unverified';
  const background = isUnconfirmedOsm(place);
  const outlined = dashed || background;
  const color = pending ? PENDING_COLOR : LAYER_META[place.layer].color;
  const phase = place.event?.phase;
  const inactive =
    phase === 'finished' || phase === 'cancelled' || place.issue?.stage === 'resolved';

  return (
    <div
      role="button"
      aria-label={recommended ? `${place.title} — для вас` : place.title}
      aria-pressed={selected}
      style={{ width: PIN_WIDTH, height: PIN_HEIGHT, '--pin': color } as CSSProperties}
      className={cn(
        'group relative origin-bottom cursor-pointer transition-[opacity,scale] duration-150 hover:scale-110 [&:has([data-selected])]:hover:scale-100',
        dimmed && 'pointer-events-none opacity-40',
      )}
    >
      {recommended && !selected && (
        <span
          aria-hidden
          className="absolute -top-0.5 left-[0.5px] size-[39px] rounded-full bg-brand/15 ring-1 ring-brand/20"
        />
      )}
      {phase === 'ongoing' && (
        <span className="absolute top-1.5 left-1.5 size-7 animate-pulse-ring rounded-full bg-(--pin) lite:scale-140 lite:opacity-25" />
      )}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{
          scale: selected ? SELECTED_SCALE : background ? BACKGROUND_SCALE : 1,
          opacity: 1,
        }}
        transition={SPRING.pop}
        data-selected={selected || undefined}
        className={cn(
          'absolute inset-0 origin-bottom',
          inactive && !selected && 'opacity-55 saturate-50',
        )}
      >
        <svg
          aria-hidden
          viewBox={`0 0 ${PIN_WIDTH} ${PIN_HEIGHT}`}
          className="absolute inset-0 overflow-visible drop-shadow-[0_2px_3px_rgb(11_29_46/0.35)] lite:filter-none"
        >
          {selected && (
            <path
              d={PIN_PATH}
              fill="none"
              stroke="var(--color-beam)"
              strokeWidth={8}
              strokeLinejoin="round"
              className="origin-[50%_45%] animate-beam-pulse [transform-box:fill-box]"
            />
          )}
          <path
            d={PIN_PATH}
            fill={outlined ? '#fff' : color}
            stroke={outlined ? color : '#fff'}
            strokeWidth={2}
            strokeDasharray={dashed ? '4.5 3' : undefined}
            strokeLinecap="round"
          />
        </svg>
        <CategoryGlyph
          slug={slug}
          layer={place.layer}
          size={17}
          strokeWidth={2.3}
          className={cn(
            'absolute top-[11.5px] left-[11.5px]',
            outlined ? 'text-(--pin)' : 'text-white',
          )}
        />
        {!background && <StatusCorner place={place} />}
        {recommended && (
          <Corner side="left" className="bg-brand text-beam">
            <Sparkles size={9} strokeWidth={2.6} />
          </Corner>
        )}
        {place.issue?.source === 'official' && (
          <Corner side="left" className="bg-official">
            <ShieldCheck size={10} strokeWidth={3} />
          </Corner>
        )}
      </motion.div>
      <span
        className={cn(
          'pointer-events-none absolute bottom-full left-1/2 mb-2 max-w-52 -translate-x-1/2 truncate rounded-lg bg-ink px-2 py-1 text-xs font-medium text-white shadow-float',
          'opacity-0 transition-opacity duration-150 group-hover:opacity-100',
        )}
      >
        {place.title}
      </span>
    </div>
  );
});
