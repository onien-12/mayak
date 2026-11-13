import type { TopicSlug } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { TONES } from '@/shared/lib/tones';

import { useTopicCatalog } from './useInterests';
import { isTopicSlug } from './topics';

const MAX_CHIPS = 4;

interface TopicChipsProps {
  /** Unknown slugs are skipped; nothing is rendered when none is left. */
  topics: readonly TopicSlug[] | undefined;
  /**
   * `subtle` — what an object is about (place and area cards); `reason` — why it is
   * recommended («для вас»), tinted in the topic's tone.
   */
  variant?: 'subtle' | 'reason';
  max?: number;
  /** Accessible name of the list. */
  label?: string;
  className?: string;
}

/** A row of small topic chips: icon + label, never a number. */
export function TopicChips({
  topics,
  variant = 'subtle',
  max = MAX_CHIPS,
  label = 'Темы',
  className,
}: TopicChipsProps) {
  const { topics: catalog } = useTopicCatalog();
  const shown = (topics ?? []).filter(isTopicSlug).slice(0, max);
  if (shown.length === 0) return null;
  const bySlug = new Map(catalog.map((topic) => [topic.slug, topic]));

  return (
    <ul aria-label={label} className={cn('flex min-w-0 flex-wrap gap-1', className)}>
      {shown.map((slug, index) => {
        const topic = bySlug.get(slug);
        if (!topic) return null;
        const Icon = topic.icon;
        return (
          <li
            key={slug}
            className={cn(
              'inline-flex h-6 max-w-full min-w-0 items-center gap-1 rounded-full px-2 text-xs font-medium whitespace-nowrap',
              // In a single-line row the strongest topic stays whole, the others give way.
              index === 0 && 'shrink-0',
              variant === 'reason' ? TONES[topic.tone].soft : 'bg-canvas text-ink-soft',
            )}
          >
            <Icon
              size={12}
              aria-hidden
              className={cn('shrink-0', variant === 'subtle' && TONES[topic.tone].text)}
            />
            <span className="truncate">{topic.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
