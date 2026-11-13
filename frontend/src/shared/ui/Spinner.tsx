import { LoaderCircle } from 'lucide-react';

import { cn } from '../lib/cn';

interface SpinnerProps {
  size?: number;
  className?: string;
  label?: string;
}

export function Spinner({ size = 18, className, label = 'Загрузка' }: SpinnerProps) {
  return (
    <LoaderCircle
      size={size}
      role="status"
      aria-label={label}
      className={cn('animate-spin text-ink-faint', className)}
    />
  );
}
