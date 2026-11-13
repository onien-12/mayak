import { motion } from 'motion/react';

import { cn } from '@/shared/lib/cn';
import { TONES } from '@/shared/lib/tones';

import { riskTone } from './moderationMeta';

const STROKE = {
  danger: 'var(--color-danger)',
  warning: 'var(--color-warning)',
  success: 'var(--color-success)',
} as const;

interface RiskMeterProps {
  /** 0..100 */
  risk: number;
  size?: number;
  className?: string;
}

/** Risk 0–100 as a ring that fills on mount, coloured green → amber → red. */
export function RiskMeter({ risk, size = 48, className }: RiskMeterProps) {
  const value = Math.max(0, Math.min(100, Math.round(risk)));
  const tone = riskTone(value);

  return (
    <span
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-label={`Риск ${value} из 100`}
      title={`Риск ${value} из 100`}
      style={{ width: size, height: size }}
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
    >
      <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="24" cy="24" r="20" fill="none" stroke="var(--color-line)" strokeWidth="5" />
        <motion.circle
          cx="24"
          cy="24"
          r="20"
          fill="none"
          stroke={STROKE[tone]}
          strokeWidth="5"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: Math.max(value, 3) / 100 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </svg>
      <span className={cn('relative text-sm font-bold tabular-nums', TONES[tone].text)}>
        {value}
      </span>
    </span>
  );
}
