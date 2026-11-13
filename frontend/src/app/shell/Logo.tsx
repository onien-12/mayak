import { cn } from '@/shared/lib/cn';
import { LogoMark } from '@/shared/ui';

interface LogoProps {
  /** `stacked`: mark above the wordmark (nav rail); `inline`: side by side. */
  layout?: 'stacked' | 'inline';
  className?: string;
}

export function Logo({ layout = 'inline', className }: LogoProps) {
  return (
    <span
      aria-label="Маяк — народная карта Владивостока"
      className={cn(
        'flex items-center',
        layout === 'stacked' ? 'flex-col gap-1' : 'gap-2',
        className,
      )}
    >
      <LogoMark size={layout === 'stacked' ? 40 : 32} />
      <span
        className={cn(
          'font-display font-bold text-brand',
          layout === 'stacked' ? 'text-2xs' : 'text-base',
        )}
      >
        Маяк
      </span>
    </span>
  );
}
