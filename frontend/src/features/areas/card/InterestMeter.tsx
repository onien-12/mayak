import { motion } from 'motion/react';

import { cn } from '@/shared/lib/cn';
import { interestLabel } from '@/shared/lib/labels';
import { SPRING } from '@/shared/ui';

const TIER_TICKS = [25, 50, 75];

interface InterestMeterProps {
  /** 0..100 */
  interest: number;
  /** `compact`: thin short bar for list rows. */
  variant?: 'full' | 'compact';
  /** Fill delay, seconds — lets the meter start after the card has settled. */
  delay?: number;
  className?: string;
}

/**
 * 0–100 interest bar in the tier colour, with faint ticks at the tier thresholds. The fill
 * grows from zero on mount (transform only).
 */
export function InterestMeter({
  interest,
  variant = 'full',
  delay = 0,
  className,
}: InterestMeterProps) {
  const value = Math.max(0, Math.min(100, Math.round(interest)));
  const tier = interestLabel(value);

  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-label={`Интерес: ${value} из 100 — ${tier.label}`}
      className={cn(
        'relative overflow-hidden rounded-full bg-line/80',
        variant === 'full' ? 'h-2.5' : 'h-1.5 w-14',
        className,
      )}
    >
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: Math.max(value, 3) / 100 }}
        transition={{ ...SPRING.soft, delay }}
        style={{ background: tier.color }}
        className="h-full origin-left rounded-full"
      />
      {variant === 'full' &&
        TIER_TICKS.map((tick) => (
          <span
            key={tick}
            aria-hidden
            style={{ left: `${tick}%` }}
            className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-surface/90"
          />
        ))}
    </div>
  );
}
