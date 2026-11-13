import { CalendarClock, Sparkles, TriangleAlert } from 'lucide-react';

import { ForYouMark, TopicChips } from '@/features/interests';
import type { AreaDetail } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { plural, pluralize, PLURALS } from '@/shared/lib/format';
import { TONES } from '@/shared/lib/tones';
import { AnimatedNumber } from '@/shared/ui';

import { shownInterest } from '../lib/interest';
import { InterestMeter } from './InterestMeter';

const METER_DELAY_S = 0.15;

/**
 * «How interesting is it»: the plain count of places (counting up), the tier label with
 * the 0–100 meter and what is going on here (the rating sits in the card's rating line; the
 * events themselves are listed right below, in «Скоро здесь»).
 * A personal interest (SPEC §23.4) takes the tier and the meter, marked «для вас» with its
 * reasons; the general interest stays right under it.
 */
export function InterestBlock({ area }: { area: AreaDetail }) {
  const interest = shownInterest(area);
  const tier = interest.tier;
  const facts = [
    area.events_upcoming > 0 && {
      key: 'events',
      icon: CalendarClock,
      text: `${pluralize(area.events_upcoming, PLURALS.event)} скоро`,
      className: 'text-event-ink',
    },
    area.issues_open > 0 && {
      key: 'issues',
      icon: TriangleAlert,
      text: pluralize(area.issues_open, PLURALS.issue),
      className: 'text-ink-soft',
    },
  ].filter((fact) => fact !== false);

  return (
    <section
      aria-label="Насколько здесь интересно"
      className="flex flex-col gap-3 rounded-card border border-line/70 bg-surface p-4 shadow-card"
    >
      <div className="flex items-end justify-between gap-3">
        <p className="flex items-baseline gap-2">
          <AnimatedNumber
            value={area.places_count}
            countUp
            className="font-display text-3xl font-bold text-ink"
          />
          <span className="text-sm text-ink-soft">
            {plural(area.places_count, PLURALS.place)} внутри
          </span>
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold',
                TONES[tier.tone].soft,
              )}
            >
              <Sparkles size={14} aria-hidden />
              {tier.label}
            </span>
            {interest.personal && (
              <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-brand">
                <ForYouMark size={16} />
                для вас
              </span>
            )}
          </span>
          <span className="shrink-0 text-xs text-ink-faint tabular-nums">
            <AnimatedNumber value={interest.value} countUp className="font-semibold text-ink" /> /
            100
          </span>
        </div>
        <InterestMeter interest={interest.value} delay={METER_DELAY_S} />
        {interest.personal && (
          <div className="mt-1 flex flex-col gap-1.5">
            <TopicChips topics={interest.reasons} variant="reason" label="Почему для вас" />
            <p className="text-xs text-ink-soft">
              В целом: {interest.baseTier.label.toLowerCase()} ·{' '}
              <span className="tabular-nums">{interest.base} / 100</span>
            </p>
          </div>
        )}
      </div>
      {facts.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {facts.map(({ key, icon: Icon, text, className }) => (
            <li key={key} className={cn('flex items-center gap-1.5', className)}>
              <Icon size={15} aria-hidden />
              {text}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
