import { ArrowLeft, LandPlot } from 'lucide-react';

import { useAreaParam, usePlaceParam } from '@/features/map';
import type { AreaRef } from '@/shared/api';
import { Pressable } from '@/shared/ui';

/**
 * «← Нагорный парк» at the top of a place card: back to the area the card was opened from,
 * or into the place's area when the card was opened elsewhere.
 */
export function AreaBreadcrumb({ area }: { area: AreaRef }) {
  const { areaId, openArea } = useAreaParam();
  const { closePlace } = usePlaceParam();
  const fromArea = areaId === area.id;

  return (
    <Pressable className="self-start">
      <button
        type="button"
        onClick={() => (fromArea ? closePlace() : openArea(area.id))}
        aria-label={
          fromArea ? `Назад к локации «${area.title}»` : `Открыть локацию «${area.title}»`
        }
        className="tap-target flex h-9 max-w-full items-center gap-1.5 rounded-full border border-line bg-surface pr-3.5 pl-2 text-sm font-semibold text-brand shadow-card transition-colors hover:bg-canvas"
      >
        <ArrowLeft size={15} aria-hidden className="shrink-0" />
        <LandPlot size={15} aria-hidden className="shrink-0 text-ink-faint" />
        <span className="truncate">{area.title}</span>
      </button>
    </Pressable>
  );
}
