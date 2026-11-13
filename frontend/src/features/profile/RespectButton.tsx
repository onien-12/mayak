import { HandHeart } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';

import { requireAuth, useAuth } from '@/features/auth';
import type { UserProfile } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { SPRING, toast } from '@/shared/ui';

import { RESPECT_REWARD, useRespect } from './useProfile';

const SPARKS = 8;
const SPARK_DISTANCE = 30;

/** A ring of small sparks that fly out once — the "thank you" moment. */
function Burst() {
  return (
    <span aria-hidden className="pointer-events-none absolute top-1/2 left-6 size-0">
      {Array.from({ length: SPARKS }, (_, index) => {
        const angle = (index / SPARKS) * Math.PI * 2;
        return (
          <motion.span
            key={index}
            initial={{ x: 0, y: 0, scale: 0.4, opacity: 1 }}
            animate={{
              x: Math.cos(angle) * SPARK_DISTANCE,
              y: Math.sin(angle) * SPARK_DISTANCE,
              scale: 1,
              opacity: 0,
            }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
            className={cn(
              'absolute -top-1 -left-1 size-2 rounded-full',
              index % 2 === 0 ? 'bg-beam' : 'bg-tourism',
            )}
          />
        );
      })}
      <motion.span
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: [0, 1, 1, 0], y: -38 }}
        transition={{ duration: 0.9, ease: 'easeOut' }}
        className="absolute -left-3 font-display text-sm font-bold text-tourism-ink"
      >
        +{RESPECT_REWARD}
      </motion.span>
    </span>
  );
}

/**
 * «Респект»: a public thank-you to another resident (+3 to their reputation). Optimistic,
 * with a spark burst and a floating «+3»; refusals (already sent, newcomer, daily limit) are
 * explained in plain words.
 */
export function RespectButton({ profile }: { profile: UserProfile }) {
  const { permissions } = useAuth();
  const respect = useRespect(profile.id);
  const reduced = useReducedMotion();
  const [bursts, setBursts] = useState(0);
  const sent = profile.respected_by_me;

  const send = () => {
    if (permissions && !permissions.can_respect) {
      toast.info('Респекты можно отправлять с уровня «Житель» — наберите 10 баллов репутации');
      return;
    }
    setBursts((count) => count + 1);
    respect.mutate();
  };

  return (
    <motion.button
      type="button"
      aria-pressed={sent}
      disabled={sent || respect.isPending}
      whileTap={{ scale: 0.94 }}
      transition={SPRING.pop}
      onClick={() => requireAuth(send, 'чтобы отправить респект')}
      className={cn(
        'tap-target relative inline-flex h-12 items-center gap-2 rounded-full px-5 text-base font-semibold transition-colors duration-200',
        sent ? 'bg-beam-soft text-ink' : 'bg-beam text-ink shadow-card hover:brightness-95',
      )}
    >
      <motion.span
        key={String(sent)}
        initial={{ scale: sent ? 0.5 : 1, rotate: sent ? -20 : 0 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={SPRING.pop}
        className="inline-flex"
      >
        <HandHeart size={20} aria-hidden className={cn(sent && 'text-tourism')} />
      </motion.span>
      {sent ? 'Респект отправлен' : 'Респект'}
      {!reduced && bursts > 0 && <Burst key={bursts} />}
    </motion.button>
  );
}
