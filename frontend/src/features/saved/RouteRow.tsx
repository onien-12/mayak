import { Clock, Footprints, MapPin } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

import type { RouteCard } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { formatDistance, formatDuration, pluralize, PLURALS } from '@/shared/lib/format';
import { ROUTE_KIND_META } from '@/shared/lib/labels';
import { TONES } from '@/shared/lib/tones';

const VIEW = 64;
const INSET = 10;

/** Projects `[lng, lat]` into the thumbnail square, keeping the aspect and centring the line. */
function project(path: RouteCard['path']): [number, number][] {
  const squeeze = Math.cos(((path[0]?.[1] ?? 0) * Math.PI) / 180);
  const xs = path.map(([lng]) => lng * squeeze);
  const ys = path.map(([, lat]) => lat);
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  const scale = (VIEW - INSET * 2) / Math.max(maxX - minX, maxY - minY, 1e-6);
  const offsetX = (VIEW - (maxX - minX) * scale) / 2;
  const offsetY = (VIEW - (maxY - minY) * scale) / 2;
  return xs.map((x, index) => [
    offsetX + (x - minX) * scale,
    VIEW - offsetY - ((ys[index] ?? minY) - minY) * scale,
  ]);
}

/** The route's own line, scaled into a square — a tiny map of where it goes. */
function PathThumb({ path }: { path: RouteCard['path'] }) {
  if (path.length < 2) return null;
  const points = project(path);
  const ends = [points[0], points.at(-1)].filter((point) => point !== undefined);

  return (
    <svg viewBox={`0 0 ${VIEW} ${VIEW}`} aria-hidden className="absolute inset-0 size-full">
      <polyline
        points={points.map(([x, y]) => `${x},${y}`).join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {ends.map(([x, y], index) => (
        <circle
          key={index}
          cx={x}
          cy={y}
          r="3.5"
          fill="#fff"
          stroke="currentColor"
          strokeWidth="2"
        />
      ))}
    </svg>
  );
}

interface RouteRowProps {
  route: RouteCard;
  trailing?: ReactNode;
}

/** Saved route: path thumbnail in the kind's colour, title, distance, duration, stops. */
export function RouteRow({ route, trailing }: RouteRowProps) {
  const kind = ROUTE_KIND_META[route.kind];
  const KindIcon = kind.icon;

  return (
    <article className="relative flex gap-3 rounded-card border border-line/70 bg-surface p-2.5 transition-[border-color,box-shadow,scale] duration-150 hover:shadow-card has-[a:active]:scale-[0.98]">
      <div
        className={cn(
          'relative size-[76px] shrink-0 overflow-hidden rounded-control',
          TONES[kind.tone].soft,
        )}
      >
        {route.cover_url ? (
          <img src={route.cover_url} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <PathThumb path={route.path} />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className={cn('flex items-center gap-1 text-xs font-medium', TONES[kind.tone].text)}>
          <KindIcon size={13} aria-hidden />
          {kind.label}
        </p>
        <h3 className="line-clamp-2 text-base leading-tight font-semibold text-ink">
          <Link
            to={`/routes/${route.id}`}
            className="after:absolute after:inset-0 after:rounded-card focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-brand"
          >
            {route.title}
          </Link>
        </h3>
        <p className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-soft">
          <span className="flex items-center gap-1">
            <Footprints size={13} aria-hidden />
            {formatDistance(route.distance_m)}
          </span>
          <span className="flex items-center gap-1">
            <Clock size={13} aria-hidden />
            {formatDuration(route.duration_min)}
          </span>
          <span className="flex items-center gap-1">
            <MapPin size={13} aria-hidden />
            {pluralize(route.stops_count, PLURALS.stop)}
          </span>
        </p>
      </div>
      {trailing && <div className="relative z-10 flex shrink-0 items-start">{trailing}</div>}
    </article>
  );
}
