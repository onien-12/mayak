import { Map as MapIcon } from 'lucide-react';
import { Link } from 'react-router';

import { buttonClasses } from './buttonClasses';

interface SectionStubProps {
  /** What will appear here, in one sentence. */
  description: string;
}

/** Neutral «раздел в разработке» state shared by sections that are not built yet. */
export function SectionStub({ description }: SectionStubProps) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <svg aria-hidden viewBox="0 0 120 96" className="mb-5 h-24 w-30">
        <path d="M60 30 118 8v44Z" fill="var(--color-beam)" opacity="0.55" />
        <path d="M60 30 2 14v32Z" fill="var(--color-beam)" opacity="0.25" />
        <path d="M51 40h18l5 48H46Z" fill="var(--color-brand)" />
        <path d="M49.5 56h21l1.2 11H48.3Z" fill="#fff" opacity="0.9" />
        <rect x="49" y="22" width="22" height="18" rx="4" fill="var(--color-brand)" />
        <circle cx="60" cy="31" r="5" fill="var(--color-beam)" />
        <path d="M54 14h12l4 8H50Z" fill="var(--color-brand)" />
        <rect x="30" y="88" width="60" height="5" rx="2.5" fill="var(--color-line)" />
      </svg>
      <h2 className="font-display text-base font-semibold text-ink">Раздел в разработке</h2>
      <p className="mt-1.5 max-w-xs text-sm text-ink-soft">{description}</p>
      <Link
        to="/"
        className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'mt-5' })}
      >
        <MapIcon size={16} aria-hidden />
        Вернуться к карте
      </Link>
    </div>
  );
}
