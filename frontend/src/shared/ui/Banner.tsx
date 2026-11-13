import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../lib/cn';
import { TONES, type Tone } from '../lib/tones';

interface BannerProps {
  tone?: Tone;
  icon?: LucideIcon;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** Inline notice: warnings, moderation notes, cold-mode explanations. */
export function Banner({
  tone = 'neutral',
  icon: Icon,
  title,
  children,
  action,
  className,
}: BannerProps) {
  return (
    <div className={cn('flex gap-3 rounded-card p-3.5 text-sm', TONES[tone].soft, className)}>
      {Icon && <Icon size={18} aria-hidden className="mt-0.5 shrink-0" />}
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn('text-ink-soft', title && 'mt-0.5')}>{children}</div>}
        {action && <div className="mt-2.5">{action}</div>}
      </div>
    </div>
  );
}
