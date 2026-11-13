import {
  BadgeCheck,
  CalendarDays,
  HandHeart,
  MapPin,
  MessageSquareQuote,
  Route,
  Vote,
  type LucideIcon,
} from 'lucide-react';
import { motion } from 'motion/react';

import type { UserStats } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { plural } from '@/shared/lib/format';
import { TONES, type Tone } from '@/shared/lib/tones';
import { AnimatedNumber, SPRING, STAGGER_STEP } from '@/shared/ui';

interface StatTile {
  key: keyof UserStats;
  icon: LucideIcon;
  tone: Tone;
  forms: readonly [string, string, string];
}

const TILES: readonly StatTile[] = [
  {
    key: 'places_verified',
    icon: BadgeCheck,
    tone: 'success',
    forms: ['место проверено', 'места проверены', 'мест проверено'],
  },
  { key: 'votes', icon: Vote, tone: 'infrastructure', forms: ['голос', 'голоса', 'голосов'] },
  {
    key: 'reviews',
    icon: MessageSquareQuote,
    tone: 'tourism',
    forms: ['отзыв', 'отзыва', 'отзывов'],
  },
  { key: 'routes', icon: Route, tone: 'brand', forms: ['маршрут', 'маршрута', 'маршрутов'] },
  {
    key: 'events_organized',
    icon: CalendarDays,
    tone: 'event',
    forms: ['событие', 'события', 'событий'],
  },
  {
    key: 'respects_received',
    icon: HandHeart,
    tone: 'beam',
    forms: ['респект', 'респекта', 'респектов'],
  },
];

/** Contribution counters with count-up; the first tile shows how many places got verified. */
export function StatsGrid({ stats }: { stats: UserStats }) {
  const verifiedShare = stats.places_total > 0 ? stats.places_verified / stats.places_total : 0;

  return (
    <div className="grid grid-cols-3 gap-2">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING.sheet}
        className="col-span-3 flex items-center gap-4 rounded-card bg-brand p-4 text-white"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/12">
          <MapPin size={22} aria-hidden className="text-beam" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-3xl leading-none font-bold">
            <AnimatedNumber value={stats.places_total} countUp />
          </p>
          <p className="mt-1 text-sm text-white/75">
            {plural(stats.places_total, ['место добавлено', 'места добавлено', 'мест добавлено'])}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15">
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: verifiedShare }}
              transition={{ ...SPRING.soft, delay: 0.2 }}
              className="h-full origin-left rounded-full bg-beam"
            />
          </div>
        </div>
      </motion.div>
      {TILES.map((tile, index) => {
        const Icon = tile.icon;
        const value = stats[tile.key];
        return (
          <motion.div
            key={tile.key}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING.sheet, delay: (index + 1) * STAGGER_STEP }}
            className="flex min-w-0 flex-col gap-2 rounded-card border border-line/70 bg-surface p-3"
          >
            <span
              className={cn(
                'flex size-7 items-center justify-center rounded-full',
                TONES[tile.tone].soft,
              )}
            >
              <Icon size={15} aria-hidden />
            </span>
            <p>
              <span className="block font-display text-2xl leading-none font-semibold text-ink">
                <AnimatedNumber value={value} countUp />
              </span>
              <span className="mt-1 block text-xs leading-tight text-ink-soft">
                {plural(value, tile.forms)}
              </span>
            </p>
          </motion.div>
        );
      })}
    </div>
  );
}
