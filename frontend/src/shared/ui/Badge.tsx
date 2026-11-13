import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../lib/cn';
import { TONES, type Tone } from '../lib/tones';

interface BadgeProps {
  tone?: Tone;
  icon?: LucideIcon;
  /** `solid` for emphasis on photos and map overlays. */
  variant?: 'soft' | 'solid' | 'outline';
  size?: 'sm' | 'md';
  className?: string;
  title?: string;
  children: ReactNode;
}

export function Badge({
  tone = 'neutral',
  icon: Icon,
  variant = 'soft',
  size = 'sm',
  className,
  title,
  children,
}: BadgeProps) {
  const tones = TONES[tone];
  return (
    <span
      title={title}
      className={cn(
        'inline-flex max-w-full shrink-0 items-center rounded-full font-medium whitespace-nowrap',
        size === 'sm' ? 'h-6 gap-1 px-2 text-xs' : 'h-7 gap-1.5 px-2.5 text-sm',
        variant === 'soft' && tones.soft,
        variant === 'solid' && tones.solid,
        variant === 'outline' && cn('border bg-surface', tones.text, tones.border),
        className,
      )}
    >
      {Icon && <Icon size={size === 'sm' ? 13 : 15} aria-hidden className="shrink-0" />}
      <span className="truncate">{children}</span>
    </span>
  );
}
