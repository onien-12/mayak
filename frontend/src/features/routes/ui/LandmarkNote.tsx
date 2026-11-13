import { Signpost } from 'lucide-react';

import { cn } from '@/shared/lib/cn';

/** «Ориентир»: how to recognise the spot — visually distinct, like a trail sign. */
export function LandmarkNote({ text, className }: { text: string; className?: string }) {
  return (
    <div
      className={cn(
        'flex gap-2.5 rounded-control border-l-[3px] border-beam bg-beam-soft px-3 py-2.5 text-sm text-ink',
        className,
      )}
    >
      <Signpost size={17} aria-hidden className="mt-0.5 shrink-0 text-warning-ink" />
      <p>
        <span className="mr-1 font-semibold">Ориентир:</span>
        {text}
      </p>
    </div>
  );
}
