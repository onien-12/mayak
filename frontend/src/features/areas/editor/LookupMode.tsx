import { useQuery } from '@tanstack/react-query';
import { PenLine, ScanSearch, Search } from 'lucide-react';
import { useEffect, useState } from 'react';

import { MapPolygon, useMapActions, useMapViewport } from '@/features/map';
import {
  ApiError,
  areasApi,
  errorMessage,
  queryKeys,
  type AreaGeometryCandidate,
  type AreaGeometryLookupQuery,
} from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import type { LatLng } from '@/shared/lib/geo';
import { AREA_GEOMETRY_SOURCE_META } from '@/shared/lib/labels';
import { polygonAreaM2, polygonBounds } from '@/shared/lib/polygon';
import { Banner, Button, Input, Spinner } from '@/shared/ui';

import { formatSquare, shortPlaceName } from '../lib/geometry';
import { DRAW_COLOR } from './DrawLayer';
import { ShapePreview } from './ShapePreview';
import type { BoundsDraft } from './useBoundsDraft';

const RATE_LIMITED = 429;
const MIN_QUERY = 3;

interface LookupModeProps {
  draft: BoundsDraft;
  /** Tapped 2GIS object: its own boundary is looked up right away. */
  objectId: string | undefined;
  initialText: string;
  /** Biases a name search; with a prefilled name the search starts right away. */
  near: LatLng | undefined;
}

function lookupError(error: unknown): string {
  if (error instanceof ApiError && error.status === RATE_LIMITED)
    return 'Слишком много поисков подряд — попробуйте через минуту или нарисуйте границы сами.';
  return errorMessage(error);
}

/** «Найти границы автоматически»: 2GIS object geometry or an OpenStreetMap search by name. */
/** First lookup: the tapped object's own boundary, else the prefilled name near the point. */
function initialQuery(
  objectId: string | undefined,
  text: string,
  near: LatLng | undefined,
): AreaGeometryLookupQuery | null {
  if (objectId) return { object_id: objectId };
  const q = text.trim();
  return q.length >= MIN_QUERY && near ? { q, lat: near.lat, lng: near.lng } : null;
}

export function LookupMode({ draft, objectId, initialText, near }: LookupModeProps) {
  const viewport = useMapViewport();
  const { fitBounds } = useMapActions();
  const [text, setText] = useState(initialText);
  const [query, setQuery] = useState(() => initialQuery(objectId, initialText, near));
  const lookup = useQuery({
    queryKey: queryKeys.areas.lookup(query ?? {}),
    queryFn: ({ signal }) => areasApi.lookupGeometry(query ?? {}, signal),
    enabled: query !== null,
    staleTime: Infinity,
    retry: false,
  });
  const candidates = query ? (lookup.data ?? []) : [];
  const { candidate, setCandidate } = draft;

  const search = () => {
    const q = text.trim();
    if (q.length < MIN_QUERY) return;
    const center = viewport?.center;
    setQuery({ q, lat: center?.lat, lng: center?.lng });
  };

  const pick = (item: AreaGeometryCandidate) => {
    setCandidate(item);
    fitBounds(polygonBounds(item.geometry), { maxZoom: 17, padding: 32 });
  };

  useEffect(() => {
    const [first] = lookup.data ?? [];
    if (first) fitBounds(polygonBounds(first.geometry), { maxZoom: 17, padding: 32 });
  }, [lookup.data, fitBounds]);

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          search();
        }}
      >
        <Input
          icon={Search}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Название: «Нагорный парк»"
          aria-label="Название для поиска границ"
          className="min-w-0"
        />
        <Button
          type="submit"
          variant="secondary"
          icon={ScanSearch}
          disabled={text.trim().length < MIN_QUERY}
        >
          Найти
        </Button>
      </form>

      {lookup.isFetching && (
        <p className="flex items-center gap-2 text-sm text-ink-soft">
          <Spinner size={14} /> Ищем границы в 2ГИС и OpenStreetMap…
        </p>
      )}
      {lookup.isError && <Banner tone="warning">{lookupError(lookup.error)}</Banner>}
      {query && lookup.isSuccess && candidates.length === 0 && (
        <Banner
          tone="neutral"
          action={
            <Button
              size="sm"
              variant="secondary"
              icon={PenLine}
              onClick={() => draft.setMode('draw')}
            >
              Нарисовать на карте
            </Button>
          }
        >
          Готовых границ не нашлось — нарисуйте их сами, это пара касаний.
        </Banner>
      )}

      {candidates.length > 0 && (
        <ul
          data-sheet-ignore
          className="-mx-4 no-scrollbar flex gap-2 overflow-x-auto px-4 pb-1 lg:-mx-5 lg:px-5"
        >
          {candidates.map((item, index) => {
            const selected = candidate?.geometry === item.geometry;
            return (
              <li key={`${item.source}-${index}`} className="shrink-0">
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => pick(item)}
                  className={cn(
                    'flex w-60 items-center gap-3 rounded-card border bg-surface p-2.5 text-left transition-[border-color,box-shadow,scale] duration-150 active:scale-[0.98]',
                    selected ? 'border-brand shadow-card ring-2 ring-beam/70' : 'border-line',
                  )}
                >
                  <ShapePreview geometry={item.geometry} color={DRAW_COLOR} />
                  <span className="min-w-0">
                    <span
                      title={item.title}
                      className="block truncate text-sm font-semibold text-ink"
                    >
                      {shortPlaceName(item.title) || 'Объект на карте 2ГИС'}
                    </span>
                    <span className="block truncate text-xs text-ink-soft">
                      {AREA_GEOMETRY_SOURCE_META[item.source].label} ·{' '}
                      {formatSquare(polygonAreaM2(item.geometry))}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {candidate && (
        <Button
          variant="ghost"
          size="sm"
          icon={PenLine}
          onClick={draft.refine}
          className="self-start"
        >
          Уточнить вручную
        </Button>
      )}

      {candidates.map((item, index) => (
        <MapPolygon
          key={`${item.source}-${index}-${candidate?.geometry === item.geometry}`}
          geometry={item.geometry}
          color={DRAW_COLOR}
          fillOpacity={candidate?.geometry === item.geometry ? 0.22 : 0.06}
          strokeOpacity={candidate?.geometry === item.geometry ? 0.95 : 0.4}
          strokeWidth={candidate?.geometry === item.geometry ? 2.5 : 1.5}
          zIndex={candidate?.geometry === item.geometry ? 5 : 4}
        />
      ))}
    </div>
  );
}
