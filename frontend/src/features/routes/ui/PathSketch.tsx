import { useId, useMemo } from 'react';

import type { PathPoint, RouteKind } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { ROUTE_KIND_META } from '@/shared/lib/labels';
import { TONES } from '@/shared/lib/tones';

import { fitToBox, pathToPoints, simplifyToCount, toPathData } from '../lib/geometry';

const SIZE = 100;
const PADDING = 16;
const MAX_POINTS = 80;

interface PathSketchProps {
  path: readonly PathPoint[];
  kind: RouteKind;
  className?: string;
}

/**
 * Designed placeholder for a route without photos: the real shape of its line, drawn over
 * a soft dotted «paper» in the colour of the route kind, with start and finish marks.
 */
export function PathSketch({ path, kind, className }: PathSketchProps) {
  const patternId = `sketch${useId().replace(/[^\w-]/g, '')}`;
  const tone = ROUTE_KIND_META[kind].tone;
  const points = useMemo(
    () => fitToBox(simplifyToCount(pathToPoints(path), MAX_POINTS), SIZE, SIZE, PADDING),
    [path],
  );
  const start = points[0];
  const end = points.at(-1);
  const d = points.length > 1 ? toPathData(points) : '';

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      aria-hidden
      preserveAspectRatio="xMidYMid slice"
      className={cn(TONES[tone].soft, className)}
    >
      <defs>
        <pattern id={patternId} width="8" height="8" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.7" fill="currentColor" opacity="0.25" />
        </pattern>
      </defs>
      <rect width={SIZE} height={SIZE} fill={`url(#${patternId})`} />
      {d && (
        <g fill="none" strokeLinejoin="round" strokeLinecap="round">
          <path d={d} stroke="#fff" strokeWidth="6.5" />
          <path d={d} stroke="var(--color-brand)" strokeWidth="2.6" />
        </g>
      )}
      {start && end && d && (
        <>
          <circle
            cx={start.x}
            cy={start.y}
            r="4.2"
            fill="#fff"
            stroke="var(--color-brand)"
            strokeWidth="2.4"
          />
          <circle
            cx={end.x}
            cy={end.y}
            r="4.6"
            fill="var(--color-beam)"
            stroke="var(--color-brand)"
            strokeWidth="2.4"
          />
        </>
      )}
    </svg>
  );
}
