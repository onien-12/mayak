import { CalendarClock, ExternalLink, Lightbulb, MapPin, MapPinned } from 'lucide-react';
import { Link, useNavigate } from 'react-router';

import type { AttributeValue, FieldDef, PlaceDetail, RouteDetail } from '@/shared/api';
import {
  formatDistance,
  formatDuration,
  formatEventRange,
  formatNumber,
  pluralize,
  PLURALS,
} from '@/shared/lib/format';
import { formatCoords } from '@/shared/lib/geo';
import {
  ISSUE_STAGE_META,
  LAYER_META,
  ROUTE_KIND_META,
  ROUTE_STATUS_META,
} from '@/shared/lib/labels';
import { Badge, Button, buttonClasses, CategoryIcon, PhotoGrid, TrustBadge } from '@/shared/ui';

import { CaseSection } from './CaseReasons';

function attributeText(field: FieldDef, value: AttributeValue): string {
  if (typeof value === 'boolean') return value ? 'да' : 'нет';
  if (field.type === 'select') {
    return field.options?.find((option) => option.value === String(value))?.label ?? String(value);
  }
  const text = typeof value === 'number' ? formatNumber(value) : value;
  return field.unit ? `${text} ${field.unit}` : text;
}

function PlacePreview({ place }: { place: PlaceDetail }) {
  const navigate = useNavigate();
  const attributes = place.category.fields.flatMap((field) => {
    const value = place.attributes[field.key];
    return value === undefined || value === '' ? [] : [{ field, value }];
  });

  return (
    <CaseSection title="Публикация">
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <CategoryIcon slug={place.category.slug} layer={place.layer} size={44} />
          <div className="min-w-0">
            <p className="text-xs font-medium text-ink-soft">
              {LAYER_META[place.layer].label} · {place.category.name}
            </p>
            <h3 className="text-lg leading-tight font-semibold text-ink">{place.title}</h3>
            <div className="mt-1.5">
              <TrustBadge status={place.status} />
            </div>
          </div>
        </div>
        <PhotoGrid photos={place.photos} alt={place.title} />
        {place.event && (
          <p className="flex items-center gap-1.5 text-sm font-medium text-event-ink">
            <CalendarClock size={15} aria-hidden />
            {formatEventRange(place.event.starts_at, place.event.ends_at)}
          </p>
        )}
        {place.issue && (
          <Badge
            tone={ISSUE_STAGE_META[place.issue.stage].tone}
            icon={ISSUE_STAGE_META[place.issue.stage].icon}
          >
            {ISSUE_STAGE_META[place.issue.stage].label}
          </Badge>
        )}
        {place.description && (
          <p className="text-base [overflow-wrap:anywhere] whitespace-pre-line text-ink">
            {place.description}
          </p>
        )}
        {place.tips && (
          <p className="flex gap-2 rounded-control bg-beam-soft p-3 text-sm text-ink">
            <Lightbulb size={16} aria-hidden className="mt-0.5 shrink-0 text-warning-ink" />
            {place.tips}
          </p>
        )}
        {attributes.length > 0 && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {attributes.map(({ field, value }) => (
              <div key={field.key} className="contents">
                <dt className="text-ink-soft">{field.label}</dt>
                <dd className="font-medium text-ink">{attributeText(field, value)}</dd>
              </div>
            ))}
          </dl>
        )}
        {place.tags.length > 0 && (
          <p className="text-sm text-ink-soft">{place.tags.map((tag) => `#${tag}`).join(' ')}</p>
        )}
        <div className="flex flex-col gap-2 rounded-control bg-canvas p-3 text-sm">
          <p className="flex items-start gap-1.5 text-ink">
            <MapPin size={15} aria-hidden className="mt-0.5 shrink-0 text-ink-faint" />
            {place.address ?? 'Адрес не указан'}
          </p>
          <p className="pl-5 text-xs text-ink-soft tabular-nums">{formatCoords(place)}</p>
          <Button
            variant="secondary"
            size="sm"
            icon={MapPinned}
            onClick={() => navigate(`/?place=${place.id}`)}
          >
            Открыть на карте
          </Button>
        </div>
      </div>
    </CaseSection>
  );
}

function RoutePreview({ route }: { route: RouteDetail }) {
  const kind = ROUTE_KIND_META[route.kind];
  const status = ROUTE_STATUS_META[route.status];
  const stops = route.stops.filter((stop) => stop.kind !== 'via');

  return (
    <CaseSection title="Маршрут">
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-xs font-medium text-ink-soft">{kind.label}</p>
          <h3 className="text-lg leading-tight font-semibold text-ink">{route.title}</h3>
          <Badge tone={status.tone} icon={status.icon} className="mt-1.5">
            {status.label}
          </Badge>
        </div>
        <p className="text-sm text-ink-soft">
          {[
            formatDistance(route.distance_m),
            formatDuration(route.duration_min),
            pluralize(route.stops_count, PLURALS.stop),
          ].join(' · ')}
        </p>
        {route.description && (
          <p className="text-base [overflow-wrap:anywhere] whitespace-pre-line text-ink">
            {route.description}
          </p>
        )}
        <ol className="flex flex-col gap-1.5">
          {stops.map((stop, index) => (
            <li key={stop.position} className="flex gap-2.5 text-sm text-ink">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                {index + 1}
              </span>
              <span className="min-w-0 pt-0.5">
                <span className="font-medium">{stop.title}</span>
                {stop.note && <span className="block text-ink-soft">{stop.note}</span>}
              </span>
            </li>
          ))}
        </ol>
        <Link
          to={`/routes/${route.id}`}
          className={buttonClasses({ variant: 'secondary', size: 'sm' })}
        >
          <ExternalLink size={16} aria-hidden />
          Открыть маршрут
        </Link>
      </div>
    </CaseSection>
  );
}

/** The publication under review, with everything needed to judge it. */
export function TargetPreview({
  place,
  route,
}: {
  place: PlaceDetail | null;
  route: RouteDetail | null;
}) {
  if (place) return <PlacePreview place={place} />;
  if (route) return <RoutePreview route={route} />;
  return (
    <CaseSection title="Публикация">
      <p className="text-sm text-ink-soft">Публикация удалена автором.</p>
    </CaseSection>
  );
}
