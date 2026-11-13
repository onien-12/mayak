import { CircleAlert, Route as RouteIcon, Spline } from 'lucide-react';

import type { PathMode, RouteKind } from '@/shared/api';
import { formatDistance, formatDuration } from '@/shared/lib/format';
import { ROUTE_KIND_META, ROUTE_KINDS } from '@/shared/lib/labels';
import { Chip, SegmentedControl, Spinner } from '@/shared/ui';

import { useBuilderStore } from './store';
import type { RoutePreviewState } from './useRoutePreview';

const PATH_MODES: { value: PathMode; label: string }[] = [
  { value: 'roads', label: 'По дорогам и тропам' },
  { value: 'direct', label: 'Напрямую' },
];

const PATH_MODE_HINTS: Record<PathMode, string> = {
  roads: 'Линию строим по улицам, дорожкам и тропам из OpenStreetMap.',
  direct:
    'Прямые отрезки между точками — для походов без дорог. Изгибы тропы задайте дополнительными точками.',
};

/** How the route is travelled and how its line is built. */
export function RouteKindPicker() {
  const kind = useBuilderStore((state) => state.draft.kind);
  const setMeta = useBuilderStore((state) => state.setMeta);
  return (
    <div className="-mx-4 no-scrollbar flex gap-1.5 overflow-x-auto px-4 lg:-mx-5 lg:px-5">
      {ROUTE_KINDS.map((value: RouteKind) => {
        const meta = ROUTE_KIND_META[value];
        return (
          <Chip
            key={value}
            tone={meta.tone}
            icon={meta.icon}
            selected={kind === value}
            onClick={() => setMeta({ kind: value })}
          >
            {meta.label}
          </Chip>
        );
      })}
    </div>
  );
}

export function PathModeSwitch() {
  const pathMode = useBuilderStore((state) => state.draft.pathMode);
  const setMeta = useBuilderStore((state) => state.setMeta);
  return (
    <div className="flex flex-col gap-1.5">
      <SegmentedControl
        label="Как строить линию"
        value={pathMode}
        options={PATH_MODES}
        onChange={(value) => setMeta({ pathMode: value })}
      />
      <p className="flex gap-1.5 text-xs text-ink-soft">
        {pathMode === 'roads' ? (
          <RouteIcon size={14} aria-hidden className="mt-px shrink-0 text-ink-faint" />
        ) : (
          <Spline size={14} aria-hidden className="mt-px shrink-0 text-ink-faint" />
        )}
        {PATH_MODE_HINTS[pathMode]}
      </p>
    </div>
  );
}

/** Live totals of the line, with honest states: recalculating, estimate, no road data. */
export function PreviewSummary({ preview }: { preview: RoutePreviewState }) {
  if (preview.path.length < 2) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-sm text-ink-soft">
        <span className="font-display text-lg font-semibold text-ink tabular-nums">
          {preview.estimate ? '≈ ' : ''}
          {formatDistance(preview.distanceM)}
        </span>
        {preview.travelMin !== null && <span>· в пути ~{formatDuration(preview.travelMin)}</span>}
        {preview.pending && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-ink-faint">
            <Spinner size={12} /> Прокладываем
          </span>
        )}
      </div>
      {preview.noRoads && (
        <p className="flex gap-1.5 text-xs text-warning-ink">
          <CircleAlert size={14} aria-hidden className="mt-px shrink-0" />
          Не нашли здесь дорог и троп — показываем прямые отрезки. Для бездорожья включите
          «Напрямую» и добавьте точки по пути.
        </p>
      )}
      {preview.failed && (
        <p className="flex gap-1.5 text-xs text-warning-ink">
          <CircleAlert size={14} aria-hidden className="mt-px shrink-0" />
          Не удалось проложить линию — пока показываем расстояние по прямой.
        </p>
      )}
    </div>
  );
}
