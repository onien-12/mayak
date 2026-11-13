import type { CoverSource, PhotoCredit as Credit } from '../api/types';
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

/**
 * The service a borrowed cover comes from, on a thumbnail too small for «Фото: Яндекс Карты»:
 * its initial in the corner, named in full for the tooltip and screen readers.
 */
export function CoverSourceMark({
  source,
  className,
}: {
  /** A borrowed cover's `cover_source`, or a hot-linked photo's `source`. */
  source: Pick<CoverSource, 'label'>;
  className?: string;
}) {
  const name = `Фото: ${source.label}`;
  return (
    <span
      title={name}
      aria-label={name}
      className={cn(
        'pointer-events-auto absolute right-1 bottom-1 flex size-4 items-center justify-center rounded-full bg-ink/50 text-[9px] leading-none font-semibold text-white',
        className,
      )}
    >
      {source.label.charAt(0)}
    </span>
  );
}
