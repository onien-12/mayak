import type { TextCredit } from '../api/types';
import { cn } from '../lib/cn';

/** «Текст: Викигид, CC BY-SA 4.0» — required (CC BY-SA) under a description from a free source. */
export function TextCreditNote({ credit, className }: { credit: TextCredit; className?: string }) {
  return (
    <p className={cn('text-xs text-ink-faint', className)}>
      Текст:{' '}
      <a
        href={credit.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${credit.label} (откроется в новой вкладке)`}
        className="underline decoration-ink-faint/40 underline-offset-2 hover:text-ink-soft"
      >
        {credit.label}
      </a>
      , {credit.license}
    </p>
  );
}
