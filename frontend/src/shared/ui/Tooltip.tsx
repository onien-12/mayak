import type { ReactNode } from 'react';

import { cn } from '../lib/cn';

interface TooltipProps {
  content: ReactNode;
  side?: 'top' | 'bottom' | 'right';
  className?: string;
  children: ReactNode;
}

const SIDES = {
  top: 'bottom-full left-1/2 mb-2 -translate-x-1/2',
  bottom: 'top-full left-1/2 mt-2 -translate-x-1/2',
  right: 'top-1/2 left-full ml-2 -translate-y-1/2',
};

/** Hover / keyboard-focus hint. The trigger must be focusable for keyboard users. */
export function Tooltip({ content, side = 'top', className, children }: TooltipProps) {
  return (
    <span className={cn('group/tooltip relative inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-50 w-max max-w-60 rounded-lg bg-ink px-2.5 py-1.5 text-xs font-medium text-white shadow-float',
          'opacity-0 transition-opacity delay-150 duration-150 group-focus-within/tooltip:opacity-100 group-hover/tooltip:opacity-100',
          SIDES[side],
        )}
      >
        {content}
      </span>
    </span>
  );
}
