import { Clock, Images } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';
import { formatDuration } from '@/shared/lib/format';
import { STOP_KIND_META } from '@/shared/lib/labels';
import { TONES } from '@/shared/lib/tones';
import { Lightbox } from '@/shared/ui';

import type { NumberedStop } from '../lib/stops';

interface WalkStopCardProps {
  item: NumberedStop;
  total: number;
  /** The way to the next stop — shown right under the title, before the details. */
  guide?: ReactNode;
}

/** The stop the walker is at: what it is, where to go next, then photo and description. */
export function WalkStopCard({ item, total, guide }: WalkStopCardProps) {
  const { stop, number } = item;
  const meta = STOP_KIND_META[stop.kind];
  const [photo, setPhoto] = useState<number | null>(null);
  const cover = stop.photos[0];
  const caption = number === 1 ? 'Старт' : number === total ? 'Финиш' : `Точка ${number}`;

  return (
    <article className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {cover && (
          <button
            type="button"
            onClick={() => setPhoto(0)}
            aria-label={`Фото точки: ${stop.photos.length}`}
            className="relative size-[72px] shrink-0 overflow-hidden rounded-control bg-canvas"
          >
            <img src={cover.url} alt="" className="size-full object-cover" />
            {stop.photos.length > 1 && (
              <span className="absolute right-1 bottom-1 inline-flex h-5 items-center gap-0.5 rounded-full bg-ink/60 px-1.5 text-2xs font-medium text-white backdrop-blur-sm lite:bg-ink/75">
                <Images size={11} aria-hidden />
                {stop.photos.length}
              </span>
            )}
          </button>
        )}
        <div className="min-w-0">
          <p
            className={cn('flex items-center gap-1.5 text-xs font-semibold', TONES[meta.tone].text)}
          >
            <meta.icon size={14} aria-hidden />
            {caption} · {meta.label}
          </p>
          <h2 className="mt-1 font-display text-xl leading-tight font-semibold text-ink">
            {stop.title}
          </h2>
        </div>
      </div>
      {guide}
      {stop.note && <p className="text-base whitespace-pre-line text-ink">{stop.note}</p>}
      {stop.stay_min > 0 && (
        <p className="flex items-center gap-1.5 text-sm text-ink-soft">
          <Clock size={15} aria-hidden />
          Здесь стоит задержаться ~{formatDuration(stop.stay_min)}
        </p>
      )}
      <Lightbox photos={stop.photos} index={photo} onIndexChange={setPhoto} alt={stop.title} />
    </article>
  );
}
