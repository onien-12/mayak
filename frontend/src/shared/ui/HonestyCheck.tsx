import { Check } from 'lucide-react';
import { useId } from 'react';

import { cn } from '../lib/cn';
import type { HonestyPledge } from './honestyPledge';

interface HonestyCheckProps {
  pledge: HonestyPledge;
  className?: string;
}

/**
 * «Мамой клянусь…»: the tick a new publication needs, placed right above its publish button.
 * The button stays enabled; pressing it without the tick calls `pledge.confirm()`, which shows
 * the reason here. Drafts are saved without it.
 */
export function HonestyCheck({ pledge, className }: HonestyCheckProps) {
  const reasonId = useId();
  const { phrase, checked, setChecked, nudged, inputRef } = pledge;

  return (
    <div className={cn('flex flex-col', className)}>
      <label className="relative flex min-h-11 cursor-pointer items-center gap-3 py-1">
        <input
          ref={inputRef}
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          aria-invalid={nudged || undefined}
          aria-describedby={nudged ? reasonId : undefined}
          onChange={(event) => setChecked(event.target.checked)}
        />
        <span
          aria-hidden
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors duration-150',
            'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand',
            checked
              ? 'border-brand bg-brand text-white'
              : nudged
                ? 'border-danger bg-danger-soft'
                : 'border-ink-faint bg-surface',
          )}
        >
          {checked && <Check size={16} strokeWidth={3} className="animate-pop-in" />}
        </span>
        <span className="min-w-0 text-sm text-ink">{phrase}</span>
      </label>
      {nudged && (
        <p id={reasonId} role="alert" className="pb-1 pl-9 text-xs text-danger-ink">
          Поставьте галочку — и публикуем
        </p>
      )}
    </div>
  );
}
