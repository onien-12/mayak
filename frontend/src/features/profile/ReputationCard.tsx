import { ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useId, useState } from 'react';

import type { UserPermissions, UserProfile } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { plural, pluralize, PLURALS } from '@/shared/lib/format';
import { LEVEL_META } from '@/shared/lib/labels';
import { AnimatedNumber, Rise, SPRING, TWEEN } from '@/shared/ui';

import { LevelLadder } from './LevelLadder';
import { levelProgress } from './levels';

interface ReputationCardProps {
  profile: UserProfile;
  /** Own profile: today's publishing allowance. */
  permissions: UserPermissions | null;
}

/** Reputation as a big ticking number, progress to the next level and the levels ladder. */
export function ReputationCard({ profile, permissions }: ReputationCardProps) {
  const [open, setOpen] = useState(false);
  const ladderId = useId();
  const progress = levelProgress(profile.level, profile.reputation, profile.next_level);
  const next = progress.nextLevel ? LEVEL_META[progress.nextLevel] : null;

  return (
    <Rise delay={0.05} className="rounded-panel border border-line/70 bg-surface p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-ink-soft">Репутация</p>
          <p className="flex items-baseline gap-2 text-ink">
            <AnimatedNumber
              value={profile.reputation}
              countUp
              className="font-display text-[44px] leading-none font-bold tracking-tight"
            />
            <span className="text-base text-ink-soft">
              {plural(profile.reputation, PLURALS.point)}
            </span>
          </p>
        </div>
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress.share * 100)}
        aria-label={next ? `Прогресс до уровня «${next.label}»` : 'Максимальный уровень'}
        className="mt-4 h-2.5 overflow-hidden rounded-full bg-beam-soft"
      >
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: Math.max(progress.share, 0.03) }}
          transition={{ ...SPRING.soft, delay: 0.15 }}
          className="h-full origin-left rounded-full bg-[linear-gradient(90deg,var(--color-beam),var(--color-tourism))]"
        />
      </div>
      <p className="mt-2 text-sm text-ink">
        {next && progress.left !== null ? (
          <>
            До уровня «{next.label}» осталось{' '}
            <span className="font-semibold">{pluralize(progress.left, PLURALS.point)}</span>
          </>
        ) : (
          'Высший уровень — спасибо, что помогаете городу!'
        )}
      </p>
      {permissions && (
        <p className="mt-1 text-xs text-ink-soft">
          Сегодня можно добавить ещё {pluralize(permissions.places_left_today, PLURALS.place)} из{' '}
          {permissions.daily_place_limit}
        </p>
      )}

      <button
        type="button"
        aria-expanded={open}
        aria-controls={ladderId}
        onClick={() => setOpen((value) => !value)}
        className="mt-4 flex min-h-11 w-full items-center justify-between rounded-control bg-canvas px-3.5 py-3 text-left text-sm font-semibold text-ink transition-transform active:scale-[0.99]"
      >
        Что даёт уровень
        <ChevronDown
          size={18}
          aria-hidden
          className={cn('text-ink-soft transition-transform duration-200', open && 'rotate-180')}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={ladderId}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6, transition: TWEEN.fast }}
            transition={SPRING.sheet}
            className="mt-3"
          >
            <LevelLadder level={profile.level} />
            <p className="mt-3 text-xs text-ink-soft">
              Баллы приходят за подтверждения мест (+2), отзывы (+1), места, которые подтвердили
              жители (+3 и +10), опубликованные маршруты (+5) и респекты (+3).
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </Rise>
  );
}
