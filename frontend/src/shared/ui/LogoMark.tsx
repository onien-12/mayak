import { cn } from '../lib/cn';

interface LogoMarkProps {
  size?: number;
  /** A circle instead of the rounded square (the «Маяк» mark next to other services). */
  round?: boolean;
  className?: string;
}

/** «Маяк» mark: a lighthouse on navy with a beam-yellow ray. */
export function LogoMark({ size = 40, round = false, className }: LogoMarkProps) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 40 40"
      width={size}
      height={size}
      className={cn('shrink-0', className)}
    >
      <rect width="40" height="40" rx={round ? 20 : 12} fill="var(--color-brand)" />
      <path d="M20 14.2 37 6.5v15.4Z" fill="var(--color-beam)" />
      <path d="M20 14.2 3 10v8.4Z" fill="var(--color-beam)" opacity="0.35" />
      <path d="M16.6 17.5h6.8l2 15h-10.8Z" fill="#fff" />
      <path d="M16 22.5h8l.5 3.6h-9Z" fill="var(--color-brand)" opacity="0.85" />
      <rect x="15.4" y="11.4" width="9.2" height="6.1" rx="1.6" fill="#fff" />
      <circle cx="20" cy="14.4" r="1.9" fill="var(--color-beam)" />
      <path d="M17.8 8.6h4.4l1.4 2.8h-7.2Z" fill="#fff" />
    </svg>
  );
}
