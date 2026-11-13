import type { PhotoCredit as Credit } from '../api/types';
import { cn } from '../lib/cn';
import { formatPhotoCredit as photoCreditText } from '../lib/format';

/**
 * Author and licence of a freely licensed photo, linked to its page — shown on the photo
 * itself (gallery, lightbox). `overlay` sits on the image, `plain` on a dark backdrop.
 */
export function PhotoCreditLink({
  credit,
  variant = 'overlay',
  className,
}: {
  credit: Credit;
  variant?: 'overlay' | 'plain';
  className?: string;
}) {
  return (
    <a
      href={credit.source_url}
      target="_blank"
      rel="noopener noreferrer"
      title={photoCreditText(credit)}
      className={cn(
        'max-w-full truncate text-2xs leading-tight text-white/90 hover:text-white',
        variant === 'overlay' && 'rounded-full bg-ink/55 px-2 py-1 backdrop-blur-sm lite:bg-ink/70',
        className,
      )}
    >
      © {credit.author} · {credit.license}
    </a>
  );
}

/** Subtle «©» on a cover that has a credit (the cover itself is usually a link). */
export function CreditMark({ credit, className }: { credit: Credit; className?: string }) {
  return (
    <span
      title={photoCreditText(credit)}
      aria-label={photoCreditText(credit)}
      className={cn(
        'pointer-events-auto absolute right-1 bottom-1 flex size-4 items-center justify-center rounded-full bg-ink/50 text-[9px] leading-none font-semibold text-white',
        className,
      )}
    >
      ©
    </span>
  );
}
