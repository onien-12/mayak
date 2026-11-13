import { SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';

import type { Recommendation, Recommendations, TopicSlug } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { IconButton, PRESS_SCALE, SPRING, STAGGER_STEP, TWEEN } from '@/shared/ui';

import { openInterestsPicker, useLocalInterests } from './localStore';
import { TopicChips } from './TopicChips';

/** The «для вас» mark: the lighthouse beam on navy, as on the map pins. */
export function ForYouMark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-brand text-beam',
        className,
      )}
    >
      <Sparkles size={Math.round(size * 0.6)} strokeWidth={2.4} />
    </span>
  );
}

/** Compact invitation shown instead of recommendations while there is no profile. */
export function ForYouInvite() {
  const dismissed = useLocalInterests((state) => state.inviteDismissed);
  const dismiss = useLocalInterests((state) => state.dismissInvite);
  if (dismissed) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={TWEEN.base}
      className="flex items-center gap-1 rounded-card border border-dashed border-brand/25 bg-brand-soft/60 pr-1"
    >
      <motion.button
        type="button"
        whileTap={{ scale: PRESS_SCALE }}
        transition={TWEEN.fast}
        onClick={() => openInterestsPicker('invite')}
        className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-card p-3 text-left focus-visible:outline-2 focus-visible:outline-brand"
      >
        <ForYouMark size={36} />
        <span className="min-w-0">
          <span className="block text-sm leading-tight font-semibold text-ink">
            Выберите интересы — покажем, что вам подойдёт
          </span>
          <span className="mt-0.5 block text-xs text-ink-soft">Полминуты, можно без аккаунта</span>
        </span>
      </motion.button>
      <IconButton icon={X} label="Не предлагать" size="sm" onClick={dismiss} />
    </motion.div>
  );
}

interface ForYouCardProps {
  cover: ReactNode;
  /** Small line above the title: kind, category or event time. */
  eyebrow: ReactNode;
  title: string;
  reasons: readonly TopicSlug[];
  onOpen: () => void;
}

/** A card of the «Для вас» strip: cover, what it is, the title and why (reason chips). */
export function ForYouCard({ cover, eyebrow, title, reasons, onOpen }: ForYouCardProps) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: PRESS_SCALE }}
      transition={TWEEN.fast}
      onClick={onOpen}
      className="flex h-full w-full items-start gap-3 rounded-card border border-brand/10 bg-surface p-2 text-left shadow-card focus-visible:outline-2 focus-visible:outline-brand"
    >
      <span className="block size-16 shrink-0 overflow-hidden rounded-control">{cover}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-1 py-0.5">
        <span className="truncate text-xs font-medium text-ink-soft">{eyebrow}</span>
        <span className="line-clamp-2 text-sm leading-tight font-semibold text-ink">{title}</span>
        <TopicChips
          topics={reasons}
          variant="reason"
          max={2}
          label="Почему для вас"
          className="flex-nowrap"
        />
      </span>
    </motion.button>
  );
}

interface ForYouStripProps {
  recommendations: Recommendations | undefined;
  /** Builds the card of one item, `null` to skip it. */
  renderCard: (item: Recommendation) => ReactNode;
  /** Item id for React keys. */
  itemKey: (item: Recommendation) => string;
}

/**
 * «Для вас»: a horizontal strip of recommended things with their reasons, or the invitation
 * to pick interests when there is no profile. Renders nothing while loading, on an error and
 * when the profile has no matches here.
 */
export function ForYouStrip({ recommendations, renderCard, itemKey }: ForYouStripProps) {
  if (!recommendations) return null;
  if (!recommendations.personalized) return <ForYouInvite />;
  const cards = recommendations.items
    .map((item) => ({ key: itemKey(item), card: renderCard(item) }))
    .filter(({ card }) => card !== null);
  if (cards.length === 0) return null;

  return (
    <section
      aria-label="Для вас"
      className="rounded-card bg-linear-to-br from-brand-soft to-brand-soft/30 pt-1.5 pb-0.5"
    >
      <div className="flex items-center gap-2 pr-1 pl-3">
        <ForYouMark />
        <h2 className="flex-1 text-sm font-semibold text-ink">Для вас</h2>
        <IconButton
          icon={SlidersHorizontal}
          label="Мои интересы"
          size="sm"
          onClick={() => openInterestsPicker('settings')}
        />
      </div>
      <ul className="mt-1 no-scrollbar flex snap-x scroll-px-3 gap-2.5 overflow-x-auto px-3 pb-3">
        {cards.map(({ key, card }, index) => (
          <motion.li
            key={key}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ...SPRING.sheet, delay: index * STAGGER_STEP }}
            className={cn(
              'shrink-0 snap-start',
              cards.length === 1 ? 'w-full' : 'w-[17.5rem] max-w-[85%]',
            )}
          >
            {card}
          </motion.li>
        ))}
      </ul>
    </section>
  );
}
