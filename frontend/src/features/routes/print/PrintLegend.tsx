import { Clock, Signpost } from 'lucide-react';

import { formatDuration } from '@/shared/lib/format';
import { STOP_KIND_META } from '@/shared/lib/labels';

import { legLabel, type NumberedStop } from '../lib/stops';

/** One numbered stop on paper; never split across pages. */
function LegendItem({ item }: { item: NumberedStop }) {
  const { stop, number, legM, legMin } = item;
  const photo = stop.photos[0];

  return (
    <li className="flex break-inside-avoid gap-3 border-b border-line py-3 last:border-b-0">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-white print:[print-color-adjust:exact]">
        {number}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h3 className="text-base font-semibold text-ink">{stop.title}</h3>
          <span className="text-xs text-ink-soft">{STOP_KIND_META[stop.kind].label}</span>
        </div>
        {(legM !== null || stop.stay_min > 0) && (
          <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-ink-soft">
            {legM !== null && legMin !== null && (
              <span>
                {legLabel(legM, legMin)} от точки {number - 1}
              </span>
            )}
            {stop.stay_min > 0 && (
              <span className="inline-flex items-center gap-1">
                <Clock size={11} aria-hidden />
                остановка ~{formatDuration(stop.stay_min)}
              </span>
            )}
          </p>
        )}
        {stop.note && <p className="mt-1.5 text-sm whitespace-pre-line text-ink">{stop.note}</p>}
        {stop.landmark && (
          <p className="mt-1.5 flex gap-1.5 border-l-[3px] border-ink-soft pl-2 text-sm text-ink">
            <Signpost size={14} aria-hidden className="mt-0.5 shrink-0" />
            <span>
              <span className="font-semibold">Ориентир: </span>
              {stop.landmark}
            </span>
          </p>
        )}
      </div>
      {photo && (
        <img
          src={photo.url}
          alt=""
          className="size-24 shrink-0 rounded-control object-cover print:size-[28mm]"
        />
      )}
    </li>
  );
}

/** Numbered legend matching the numbers on the printed map. */
export function PrintLegend({ stops }: { stops: readonly NumberedStop[] }) {
  return (
    <ol className="flex flex-col">
      {stops.map((item) => (
        <LegendItem key={item.stop.position} item={item} />
      ))}
    </ol>
  );
}
