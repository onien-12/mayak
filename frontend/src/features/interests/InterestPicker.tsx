import { Check } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import type { TopicSlug } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { pluralize, PLURALS } from '@/shared/lib/format';
import { TONES } from '@/shared/lib/tones';
import { popVariants, PRESS_SCALE, STAGGER_STEP, TWEEN } from '@/shared/ui';

import { RECOMMENDED_TOPICS, type TopicMeta } from './topics';
import { useTopicCatalog } from './useInterests';

interface InterestPickerProps {
  value: readonly TopicSlug[];
  onChange: (topics: TopicSlug[]) => void;
}

function Tile({
  topic,
  selected,
  index,
  onToggle,
}: {
  topic: TopicMeta;
  selected: boolean;
  index: number;
  onToggle: () => void;
}) {
  const Icon = topic.icon;
  const tone = TONES[topic.tone];
  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...TWEEN.base, delay: index * STAGGER_STEP }}
    >
      <motion.button
        type="button"
        aria-pressed={selected}
        onClick={onToggle}
        whileTap={{ scale: PRESS_SCALE }}
        transition={TWEEN.fast}
        className={cn(
          'relative flex h-full min-h-[118px] w-full flex-col items-start gap-2 overflow-hidden rounded-card border-[1.5px] bg-surface p-3 text-left',
          'transition-[border-color,box-shadow] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
          selected ? cn(tone.border, 'shadow-card') : 'border-line hover:border-ink-faint/60',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'absolute inset-0 opacity-0 transition-opacity duration-200',
            tone.soft,
            selected && 'opacity-60',
          )}
        />
        <span
          aria-hidden
          className={cn(
            'relative flex size-10 items-center justify-center rounded-full transition-colors duration-200',
            selected ? tone.solid : tone.soft,
          )}
        >
          <Icon size={20} strokeWidth={2.1} />
        </span>
        <span className="relative text-sm leading-tight font-semibold text-ink">{topic.label}</span>
        <span className="relative line-clamp-3 text-xs leading-snug text-ink-soft">
          {topic.description}
        </span>
        <AnimatePresence>
          {selected && (
            <motion.span
              aria-hidden
              variants={popVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className={cn(
                'absolute top-2.5 right-2.5 flex size-6 items-center justify-center rounded-full',
                tone.solid,
              )}
            >
              <Check size={14} strokeWidth={3} />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </motion.li>
  );
}

/** «Хотя бы три» as advice, not a rule: three dots that fill up, then a calm «отлично». */
export function PickerProgress({ count }: { count: number }) {
  const enough = count >= RECOMMENDED_TOPICS;
  return (
    <p className="flex items-center gap-2 text-sm text-ink-soft" aria-live="polite">
      <span aria-hidden className="flex gap-1">
        {Array.from({ length: RECOMMENDED_TOPICS }, (_, index) => (
          <span
            key={index}
            className={cn(
              'size-2 rounded-full transition-colors duration-200',
              index < count ? (enough ? 'bg-success' : 'bg-brand') : 'bg-line',
            )}
          />
        ))}
      </span>
      {enough
        ? `Выбрано: ${pluralize(count, PLURALS.topic)} — отлично`
        : count === 0
          ? 'Выберите хотя бы три — так подборка будет точнее'
          : `Выбрано: ${pluralize(count, PLURALS.topic)} · лучше хотя бы три`}
    </p>
  );
}

/** Tiles of the 13 topics (icon, label, short description), multi-select. */
export function InterestPicker({ value, onChange }: InterestPickerProps) {
  const { topics } = useTopicCatalog();
  const toggle = (slug: TopicSlug) =>
    onChange(value.includes(slug) ? value.filter((item) => item !== slug) : [...value, slug]);

  return (
    <ul aria-label="Темы" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
      {topics.map((topic, index) => (
        <Tile
          key={topic.slug}
          topic={topic}
          index={index}
          selected={value.includes(topic.slug)}
          onToggle={() => toggle(topic.slug)}
        />
      ))}
    </ul>
  );
}
