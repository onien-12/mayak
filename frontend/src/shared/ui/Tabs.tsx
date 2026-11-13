import { motion } from 'motion/react';
import { useId } from 'react';

import { cn } from '../lib/cn';
import { SPRING } from './motion';

interface TabOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

interface TabsProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  tabs: readonly TabOption<T>[];
  label: string;
  className?: string;
}

/** Tab list with a beam-yellow marker that slides to the active tab. Render the panel yourself. */
export function Tabs<T extends string>({ value, onChange, tabs, label, className }: TabsProps<T>) {
  const markerId = useId();

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn('flex gap-1 border-b border-line', className)}
    >
      {tabs.map((tab) => {
        const selected = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.value)}
            className={cn(
              'relative -mb-px flex h-11 items-center gap-1.5 px-3 text-sm font-medium transition-colors duration-150',
              selected ? 'text-ink' : 'text-ink-soft hover:text-ink',
            )}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span
                className={cn(
                  'rounded-full px-1.5 text-2xs leading-[18px] font-semibold transition-colors',
                  selected ? 'bg-brand text-white' : 'bg-canvas text-ink-soft',
                )}
              >
                {tab.count}
              </span>
            )}
            {selected && (
              <motion.span
                layoutId={markerId}
                transition={SPRING.layout}
                className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-beam"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
