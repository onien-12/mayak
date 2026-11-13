import { ExternalLink } from 'lucide-react';
import { motion } from 'motion/react';

import type { OutageResource, OutageSummary } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { plural, pluralize, PLURALS } from '@/shared/lib/format';
import { EXTERNAL_SOURCE_META, OUTAGE_RESOURCE_META } from '@/shared/lib/labels';
import { TONES } from '@/shared/lib/tones';
import { AnimatedNumber, PRESS_SCALE, SPRING, STAGGER_STEP, TWEEN } from '@/shared/ui';

import { joinResources } from './outageText';

interface OutagesSummaryProps {
  summary: OutageSummary;
  resource: OutageResource | null;
  onToggle: (resource: OutageResource) => void;
}

function ResourceTile({
  stat,
  index,
  selected,
  dimmed,
  onToggle,
}: {
  stat: OutageSummary['by_resource'][number];
  index: number;
  selected: boolean;
  dimmed: boolean;
  onToggle: () => void;
}) {
  const meta = OUTAGE_RESOURCE_META[stat.resource];
  const Icon = meta.icon;
  const idle = stat.outages === 0;

  return (
    <motion.button
      type="button"
      aria-pressed={selected}
      disabled={idle}
      onClick={onToggle}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: dimmed ? 0.55 : 1, y: 0 }}
      transition={{ ...SPRING.sheet, delay: index * STAGGER_STEP }}
      whileTap={{ scale: PRESS_SCALE }}
      className={cn(
        'flex min-h-[72px] items-center gap-2.5 rounded-card border bg-surface p-2.5 text-left transition-[border-color,box-shadow] duration-150 max-[379px]:gap-2 max-[379px]:p-2',
        selected ? cn(TONES[meta.tone].border, 'shadow-card') : 'border-line/70',
      )}
    >
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-xl max-[379px]:size-8',
          idle
            ? 'bg-canvas text-ink-faint'
            : selected
              ? TONES[meta.tone].solid
              : TONES[meta.tone].soft,
        )}
      >
        <Icon size={19} aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-ink">{meta.label}</span>
        <span className="block text-xs text-ink-soft">
          {idle ? 'без отключений' : pluralize(stat.buildings, PLURALS.house)}
        </span>
        {!idle && (
          <span className="block text-2xs text-ink-faint">
            {pluralize(stat.outages, PLURALS.outage)}
          </span>
        )}
      </span>
    </motion.button>
  );
}

/**
 * Calm headline of the section: how many addresses are without what right now, four
 * resource tiles that work as filters, freshness and the source.
 */
export function OutagesSummary({ summary, resource, onToggle }: OutagesSummaryProps) {
  const active = summary.by_resource.filter((stat) => stat.outages > 0);
  const selected = resource ? summary.by_resource.find((stat) => stat.resource === resource) : null;
  const buildings = selected ? selected.buildings : summary.totals.buildings;
  const what = selected
    ? joinResources([selected.resource])
    : joinResources(active.map((stat) => stat.resource));
  const source = EXTERNAL_SOURCE_META.vl_ru_off;
  const SourceIcon = source.icon;

  return (
    <section aria-label="Сводка отключений" className="flex flex-col gap-3">
      <div>
        <p className="font-display text-3xl leading-none font-semibold tracking-tight text-ink">
          <AnimatedNumber value={buildings} countUp />
          <span className="ml-2 text-xl">{plural(buildings, PLURALS.address)}</span>
        </p>
        <motion.p
          key={what}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={TWEEN.base}
          className="mt-1.5 text-base text-ink-soft"
        >
          сейчас без {what}
        </motion.p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {summary.by_resource.map((stat, index) => (
          <ResourceTile
            key={stat.resource}
            stat={stat}
            index={index}
            selected={resource === stat.resource}
            dimmed={resource !== null && resource !== stat.resource}
            onToggle={() => onToggle(stat.resource)}
          />
        ))}
      </div>

      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-faint">
        <span>По данным</span>
        <a
          href={summary.source_url}
          target="_blank"
          rel="noopener noreferrer"
          title={source.description}
          className="tap-target relative inline-flex h-6 items-center gap-1 rounded-full border border-line bg-surface px-2 font-medium text-ink-soft transition-colors hover:text-ink"
        >
          <SourceIcon size={12} aria-hidden />
          {source.label}
          <ExternalLink size={11} aria-hidden />
        </a>
      </p>
    </section>
  );
}
