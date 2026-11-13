import {
  CalendarDays,
  CircleCheck,
  Route,
  TriangleAlert,
  Users,
  Vote,
  type LucideIcon,
} from 'lucide-react';
import { motion } from 'motion/react';

import type { Stats } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { formatNumber, plural, PLURALS } from '@/shared/lib/format';
import { TONES, type Tone } from '@/shared/lib/tones';
import { AnimatedNumber, SPRING, STAGGER_STEP } from '@/shared/ui';

import { formatShare } from './chartUtils';

interface Tile {
  key: string;
  value: number;
  forms: readonly [string, string, string];
  icon: LucideIcon;
  tone: Tone;
}

/**
 * The headline number — places residents put on the map, and the share several residents
 * verified — and the other city totals. Imports are counted apart (see `DataSources`).
 */
export function HeroTotals({ totals }: { totals: Stats['totals'] }) {
  const tiles: Tile[] = [
    {
      key: 'users',
      value: totals.users,
      forms: ['житель', 'жителя', 'жителей'],
      icon: Users,
      tone: 'brand',
    },
    {
      key: 'votes',
      value: totals.votes,
      forms: PLURALS.confirmation,
      icon: Vote,
      tone: 'infrastructure',
    },
    {
      key: 'events',
      value: totals.events_upcoming,
      forms: ['событие впереди', 'события впереди', 'событий впереди'],
      icon: CalendarDays,
      tone: 'event',
    },
    { key: 'routes', value: totals.routes, forms: PLURALS.route, icon: Route, tone: 'tourism' },
    {
      key: 'issues',
      value: totals.issues_open_community,
      forms: ['проблема в работе', 'проблемы в работе', 'проблем в работе'],
      icon: TriangleAlert,
      tone: 'issue',
    },
    {
      key: 'resolved',
      value: totals.issues_resolved,
      forms: ['проблема решена', 'проблемы решены', 'проблем решено'],
      icon: CircleCheck,
      tone: 'success',
    },
  ];

  return (
    <section aria-label="Итоги" className="flex flex-col gap-3">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING.sheet}
        className="relative overflow-hidden rounded-panel bg-brand p-6 text-white"
      >
        <div
          aria-hidden
          className="absolute -top-16 -right-16 size-56 rounded-full bg-[radial-gradient(circle,var(--color-beam)_0%,transparent_65%)] opacity-50"
        />
        <p className="relative text-sm text-white/75">Жители отметили на карте Владивостока</p>
        <p className="relative mt-1 flex items-baseline gap-3">
          <AnimatedNumber
            value={totals.places}
            countUp
            className="font-display text-6xl leading-none font-bold tracking-tight"
          />
          <span className="text-lg text-white/85">{plural(totals.places, PLURALS.place)}</span>
        </p>
        <p className="relative mt-3 text-base text-white/90">
          <span className="font-semibold text-beam">
            {formatShare(totals.verified_places, totals.places)}
          </span>{' '}
          из них проверены несколькими жителями
        </p>
        {totals.imported_places > 0 && (
          <p className="relative mt-1 text-sm text-white/70">
            и ещё {formatNumber(totals.imported_places)}{' '}
            {plural(totals.imported_places, PLURALS.place)} из открытых источников
          </p>
        )}
      </motion.div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {tiles.map((tile, index) => {
          const Icon = tile.icon;
          return (
            <motion.li
              key={tile.key}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...SPRING.sheet, delay: (index + 1) * STAGGER_STEP }}
              className="flex items-center gap-3 rounded-card border border-line/70 bg-surface p-3.5"
            >
              <span
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-full',
                  TONES[tile.tone].soft,
                )}
              >
                <Icon size={17} aria-hidden />
              </span>
              <p className="min-w-0">
                <AnimatedNumber
                  value={tile.value}
                  countUp
                  className="block font-display text-xl leading-tight font-semibold text-ink"
                />
                <span className="block text-xs leading-tight text-ink-soft">
                  {plural(tile.value, tile.forms)}
                </span>
              </p>
            </motion.li>
          );
        })}
      </ul>
    </section>
  );
}
