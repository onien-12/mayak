import { ArrowLeft, Backpack, Download, MapPinOff, Printer } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';

import { errorMessage, type RouteDetail } from '@/shared/api';
import { formatDate, formatDistance, formatDuration, pluralize } from '@/shared/lib/format';
import { ROUTE_DIFFICULTY_META, ROUTE_KIND_META } from '@/shared/lib/labels';
import { Button, buttonClasses, EmptyState, ErrorState, OsmCredit, Spinner } from '@/shared/ui';

import { ROUTE_PLURALS } from './lib/plurals';
import { downloadGpx, routeUrl } from './lib/share';
import { numberStops } from './lib/stops';
import { PrintLegend } from './print/PrintLegend';
import { PrintMap } from './print/PrintMap';
import { QrCode } from './print/QrCode';
import { isNotFound, parseRouteId, useRoute } from './useRoute';

const PRINT_STYLES = `
@page { size: A4 portrait; margin: 14mm 12mm 16mm; }
@media print {
  html, body, #root { height: auto !important; background: #fff !important; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

function Toolbar({ route, printable }: { route: RouteDetail; printable: boolean }) {
  const [gpx, setGpx] = useState<'idle' | 'loading' | string>('idle');

  const download = async () => {
    setGpx('loading');
    try {
      await downloadGpx(route);
      setGpx('idle');
    } catch (error) {
      setGpx(errorMessage(error));
    }
  };

  return (
    <div className="sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur print:hidden lite:bg-surface">
      <div className="mx-auto flex max-w-[210mm] flex-wrap items-center gap-2 px-4 py-3">
        <Link
          to={`/routes/${route.id}`}
          className={buttonClasses({ variant: 'ghost', size: 'sm' })}
        >
          <ArrowLeft size={16} aria-hidden />К маршруту
        </Link>
        <div className="ml-auto flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={Download}
            loading={gpx === 'loading'}
            onClick={() => void download()}
          >
            GPX
          </Button>
          <Button size="sm" icon={Printer} disabled={!printable} onClick={() => window.print()}>
            Печать / сохранить в PDF
          </Button>
        </div>
        {gpx !== 'idle' && gpx !== 'loading' && (
          <p className="w-full text-right text-xs text-danger-ink">{gpx}</p>
        )}
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-2xs text-ink-faint uppercase">{label}</span>
      <span className="font-display text-base font-semibold text-ink">{value}</span>
    </div>
  );
}

function PrintSheet({ route }: { route: RouteDetail }) {
  const stops = useMemo(() => numberStops(route), [route]);
  const [mapSettled, setMapSettled] = useState(false);
  const settle = useCallback(() => setMapSettled(true), []);
  const kind = ROUTE_KIND_META[route.kind];
  const difficulty = route.difficulty ? ROUTE_DIFFICULTY_META[route.difficulty].label : null;
  const url = routeUrl(route.id);

  return (
    <>
      <Toolbar route={route} printable={mapSettled} />
      <article
        data-print-ready={mapSettled || undefined}
        className="mx-auto my-6 flex max-w-[210mm] flex-col gap-5 bg-surface px-6 py-8 shadow-card sm:px-10 print:my-0 print:max-w-none print:p-0 print:shadow-none"
      >
        <header className="flex items-start gap-5">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold tracking-wide text-ink-soft uppercase">
              {[kind.label, difficulty].filter(Boolean).join(' · ')}
            </p>
            <h1 className="mt-1 font-display text-2xl leading-tight font-semibold text-ink">
              {route.title}
            </h1>
            <p className="mt-1 text-sm text-ink-soft">
              Автор — {route.author.display_name} · {formatDate(route.updated_at)}
            </p>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
              <Fact label="Длина" value={formatDistance(route.distance_m)} />
              <Fact label="В пути" value={formatDuration(route.travel_min)} />
              <Fact label="С остановками" value={formatDuration(route.duration_min)} />
              <Fact label="Точки" value={pluralize(stops.length, ROUTE_PLURALS.point)} />
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-center gap-1">
            <QrCode value={url} size={104} />
            <span className="max-w-[110px] text-center text-2xs leading-tight text-ink-soft">
              Маршрут на телефоне: наведите камеру
            </span>
          </div>
        </header>

        <PrintMap path={route.path} stops={stops} onSettled={settle} />

        {route.description && (
          <p className="text-sm whitespace-pre-line text-ink">{route.description}</p>
        )}
        {route.tips && (
          <section className="flex break-inside-avoid gap-2.5 rounded-control border border-line p-3">
            <Backpack size={18} aria-hidden className="mt-0.5 shrink-0 text-ink-soft" />
            <div>
              <h2 className="text-sm font-semibold text-ink">Что взять и когда идти</h2>
              <p className="mt-0.5 text-sm whitespace-pre-line text-ink">{route.tips}</p>
            </div>
          </section>
        )}

        <section>
          <h2 className="font-display text-base font-semibold text-ink">Точки маршрута</h2>
          <PrintLegend stops={stops} />
        </section>

        <footer className="flex items-center justify-between gap-3 border-t border-line pt-3 text-xs text-ink-soft">
          <span className="font-semibold text-ink">Маяк — народная карта Владивостока</span>
          {route.path_source === 'osm' && (
            <OsmCredit prefix="Линия маршрута: " className="shrink-0 text-ink-soft" />
          )}
          <span className="truncate">{url.replace(/^https?:\/\//, '')}</span>
        </footer>
      </article>
    </>
  );
}

/** `/routes/:id/print` — standalone, print-optimised A4 page (no app shell, no live map). */
export default function RoutePrintPage() {
  const id = parseRouteId(useParams().id);
  const route = useRoute(id);

  return (
    <main className="h-full overflow-auto bg-canvas print:h-auto print:overflow-visible print:bg-surface">
      <style>{PRINT_STYLES}</style>
      {route.data ? (
        <PrintSheet route={route.data} />
      ) : Number.isNaN(id) || isNotFound(route.error) ? (
        <EmptyState
          icon={MapPinOff}
          title="Маршрут не найден"
          description="Возможно, его удалили или он личный."
          action={
            <Link to="/routes" className={buttonClasses({ variant: 'secondary' })}>
              Все маршруты
            </Link>
          }
          className="h-full justify-center"
        />
      ) : route.isError ? (
        <ErrorState
          error={route.error}
          onRetry={() => void route.refetch()}
          className="h-full justify-center"
        />
      ) : (
        <div className="flex h-full items-center justify-center">
          <Spinner size={24} />
        </div>
      )}
    </main>
  );
}
