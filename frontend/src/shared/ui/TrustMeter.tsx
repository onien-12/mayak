import { motion } from 'motion/react';

import { cn } from '../lib/cn';
import { AnimatedNumber } from './Animated';
import { SPRING } from './motion';

interface TrustMeterProps {
  /** 0..100 */
  score: number;
  /** `compact`: thin bar with the number, for list rows. */
  variant?: 'full' | 'compact';
  className?: string;
}

function scoreColor(score: number): { bar: string; text: string; word: string } {
  if (score >= 70) return { bar: 'bg-success', text: 'text-success-ink', word: 'высокое' };
  if (score >= 40)
    return { bar: 'bg-infrastructure', text: 'text-infrastructure-ink', word: 'среднее' };
  return { bar: 'bg-warning', text: 'text-warning-ink', word: 'низкое' };
}

/**
 * 0–100 trust bar: how confident the community is that the information is true and fresh.
 * The bar grows and the number ticks whenever the score changes (e.g. after a vote).
 */
export function TrustMeter({ score, variant = 'full', className }: TrustMeterProps) {
  const value = Math.max(0, Math.min(100, Math.round(score)));
  const color = scoreColor(value);
  const bar = (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-label={`Доверие: ${value} из 100`}
      className={cn(
        'overflow-hidden rounded-full bg-line/80',
        variant === 'full' ? 'h-2' : 'h-1.5 w-12',
      )}
    >
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: Math.max(value, 4) / 100 }}
        transition={SPRING.soft}
        className={cn('h-full origin-left rounded-full transition-colors duration-300', color.bar)}
      />
    </div>
  );

  if (variant === 'compact') {
    return (
      <span
        className={cn('inline-flex items-center gap-1.5', className)}
        title={`Доверие: ${value} из 100`}
      >
        {bar}
        <span className={cn('text-xs font-semibold tabular-nums', color.text)}>{value}</span>
      </span>
    );
  }

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm text-ink-soft">
          Доверие — <span className={cn('font-medium', color.text)}>{color.word}</span>
        </span>
        <span className="font-display text-lg font-semibold text-ink">
          <AnimatedNumber value={value} countUp />
          <span className="text-xs font-normal text-ink-faint"> / 100</span>
        </span>
      </div>
      {bar}
    </div>
  );
}
