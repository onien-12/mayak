import type { LucideIcon } from 'lucide-react';
import { createContext, use, type ReactNode } from 'react';

import { cn } from '../lib/cn';
import { Popover, type PopoverPlacement } from './Popover';

const DropdownContext = createContext<() => void>(() => undefined);

interface DropdownProps {
  trigger: Parameters<typeof Popover>[0]['trigger'];
  placement?: PopoverPlacement;
  label: string;
  className?: string;
  children: ReactNode;
}

/** Action menu. Compose with `DropdownItem`, `DropdownLabel`, `DropdownSeparator`. */
export function Dropdown({ trigger, placement, label, className, children }: DropdownProps) {
  return (
    <Popover
      role="menu"
      label={label}
      placement={placement}
      trigger={trigger}
      className={cn('lg:min-w-52 lg:p-1.5', className)}
    >
      {(close) => (
        <DropdownContext value={close}>
          <div className="px-2 pb-1 lg:p-0">{children}</div>
        </DropdownContext>
      )}
    </Popover>
  );
}

interface DropdownItemProps {
  icon?: LucideIcon;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  children: ReactNode;
}

export function DropdownItem({
  icon: Icon,
  onSelect,
  danger,
  disabled,
  children,
}: DropdownItemProps) {
  const close = use(DropdownContext);
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={() => {
        close();
        onSelect();
      }}
      className={cn(
        'flex min-h-12 w-full items-center gap-3 rounded-control px-3 text-left text-base font-medium transition-colors active:bg-canvas lg:min-h-10 lg:gap-2.5 lg:rounded-lg lg:px-2.5 lg:text-sm',
        'disabled:pointer-events-none disabled:opacity-50',
        danger ? 'text-danger-ink hover:bg-danger-soft' : 'text-ink hover:bg-canvas',
      )}
    >
      {Icon && <Icon size={18} aria-hidden className={danger ? undefined : 'text-ink-soft'} />}
      {children}
    </button>
  );
}

export function DropdownLabel({ children }: { children: ReactNode }) {
  return <div className="px-2.5 pt-1.5 pb-1 text-xs text-ink-faint">{children}</div>;
}

export function DropdownSeparator() {
  return <div role="separator" className="mx-1 my-1.5 h-px bg-line" />;
}
