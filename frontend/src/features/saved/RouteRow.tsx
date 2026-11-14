import type { ReactNode } from 'react';

import type { RouteCard } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { formatDistance, formatDuration } from '@/shared/lib/format';
import { ROUTE_DIFFICULTY_META, ROUTE_KIND_META } from '@/shared/lib/labels';
import { TONES } from '@/shared/lib/tones';
import { ListCard, ListMark } from '@/shared/ui';

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

/** Saved route: path thumbnail in the kind's colour, name, «how · how hard», length and time. */
export function RouteRow({ route, trailing }: RouteRowProps) {
  const kind = ROUTE_KIND_META[route.kind];
  const difficulty = route.difficulty ? ROUTE_DIFFICULTY_META[route.difficulty] : null;

  return (
    <ListCard
      media={
        route.cover_url ? (
          <img src={route.cover_url} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <span className={cn('relative block size-full', TONES[kind.tone].soft)}>
            <PathThumb path={route.path} />
          </span>
        )
      }
      title={route.title}
      to={`/routes/${route.id}`}
      meta={difficulty ? `${kind.label} · ${difficulty.label.toLowerCase()}` : kind.label}
      marks={
        <ListMark strong>
          {formatDistance(route.distance_m)} · {formatDuration(route.duration_min)}
        </ListMark>
      }
      trailing={trailing}
    />
  );
}
