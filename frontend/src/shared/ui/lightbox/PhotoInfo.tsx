import { ArrowUpRight } from 'lucide-react';

import { cn } from '../../lib/cn';
import { PhotoCreditLink } from '../PhotoCredit';
import type { ViewerPhoto } from './types';

/** The line under the photo: caption, licence or source credit, and the photo's action. */
export function PhotoInfo({ photo, onClose }: { photo: ViewerPhoto; onClose: () => void }) {
  const { caption, credit, source, action } = photo;
  if (!caption && !credit && !source && !action) return null;
  return (
    <div
      className={cn(
        'pointer-events-auto flex min-h-11 max-w-full items-center gap-3 rounded-full bg-ink/60 py-1.5 pl-3.5 text-sm text-white backdrop-blur-sm',
        action ? 'pr-1.5' : 'pr-3.5',
      )}
    >
      {caption && <span className="min-w-0 truncate font-medium">{caption}</span>}
      {credit && <PhotoCreditLink credit={credit} variant="plain" className="min-w-0" />}
      {source && (
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-8 shrink-0 items-center gap-1 text-xs text-white/85 hover:text-white"
        >
          Фото: {source.label}
          <ArrowUpRight size={12} aria-hidden />
        </a>
      )}
      {action && (
        <button
          type="button"
          onClick={() => {
            onClose();
            action.onSelect();
          }}
          className="h-8 shrink-0 rounded-full bg-white px-3 text-sm font-semibold text-ink hover:bg-white/90"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
