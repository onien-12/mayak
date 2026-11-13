import { useEffect, useMemo, useState } from 'react';

import type { PathPoint } from '@/shared/api';
import { formatDistance } from '@/shared/lib/format';

import { pathToPoints, simplifyToCount, toPathData } from '../lib/geometry';
import { fitStaticView, metersPerPixel, projectStatic, staticMapUrl } from '../lib/staticMap';
import type { NumberedStop } from '../lib/stops';

const WIDTH = 720;
const HEIGHT = 470;
const PADDING = 40;
const MAX_LINE_POINTS = 600;
const SCALE_STEPS = [50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10_000, 20_000, 50_000];

type ImageState = 'loading' | 'ready' | 'failed';

function ScaleBar({ metersPerPx }: { metersPerPx: number }) {
  const meters = SCALE_STEPS.findLast((step) => step / metersPerPx <= 120) ?? SCALE_STEPS[0] ?? 100;
  const width = meters / metersPerPx;
  return (
    <g transform={`translate(16 ${HEIGHT - 22})`}>
      <rect x={-6} y={-16} width={width + 12} height={26} rx={6} fill="#fff" opacity={0.88} />
      <path d={`M0 0V4H${width}V0`} fill="none" stroke="#0B1D2E" strokeWidth={2} />
      <text x={width / 2} y={-5} textAnchor="middle" fontSize={11} fontWeight={600} fill="#0B1D2E">
        {formatDistance(meters)}
      </text>
    </g>
  );
}

function NorthArrow() {
  return (
    <g transform={`translate(${WIDTH - 30} 30)`}>
      <circle r={16} fill="#fff" opacity={0.9} stroke="#0B1D2E" strokeWidth={1} />
      <path d="M0 -11 6 6 0 2 -6 6Z" fill="#0B1D2E" />
      <text y={-19} textAnchor="middle" fontSize={10} fontWeight={700} fill="#0B1D2E">
        С
      </text>
    </g>
  );
}

interface PrintMapProps {
  path: readonly PathPoint[];
  stops: readonly NumberedStop[];
  /** Called once the base image has loaded or failed (printing waits for it). */
  onSettled: () => void;
}

/**
 * The route for paper: a 2GIS Static API base map of the exact bounding view, with our
 * own line and numbered stops projected on top (Web Mercator) — the same numbers as the
 * legend, dark line with a white casing that survives black-and-white printing. Without a
 * key or when the image fails, a clean schematic (grid, line, numbers, scale) remains.
 */
export function PrintMap({ path, stops, onSettled }: PrintMapProps) {
  const geometry = useMemo(() => {
    const line = simplifyToCount(pathToPoints(path), MAX_LINE_POINTS);
    const all = [...line, ...stops.map((item) => item.stop)];
    const view = fitStaticView(all, WIDTH, HEIGHT, PADDING);
    return {
      view,
      url: staticMapUrl(view),
      d: toPathData(line.map((point) => projectStatic(point, view))),
      pins: stops.map((item) => ({ number: item.number, ...projectStatic(item.stop, view) })),
    };
  }, [path, stops]);
  const [image, setImage] = useState<ImageState>(geometry.url ? 'loading' : 'failed');

  useEffect(() => {
    if (!geometry.url) onSettled();
  }, [geometry.url, onSettled]);

  const settle = (state: ImageState) => {
    setImage(state);
    onSettled();
  };

  const schematic = image === 'failed';
  const lastNumber = stops.length;

  return (
    <figure className="relative overflow-hidden rounded-card border border-line bg-canvas print:rounded-none">
      {geometry.url && !schematic && (
        <img
          src={geometry.url}
          alt=""
          width={WIDTH}
          height={HEIGHT}
          onLoad={() => settle('ready')}
          onError={() => settle('failed')}
          className="block h-auto w-full"
        />
      )}
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Карта маршрута с пронумерованными точками"
        className={schematic ? 'block h-auto w-full' : 'absolute inset-0 size-full'}
      >
        {schematic && (
          <>
            <defs>
              <pattern id="print-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M40 0H0V40" fill="none" stroke="#D5DEE7" strokeWidth={1} />
              </pattern>
            </defs>
            <rect width={WIDTH} height={HEIGHT} fill="#F4F7FA" />
            <rect width={WIDTH} height={HEIGHT} fill="url(#print-grid)" />
          </>
        )}
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d={geometry.d} stroke="#fff" strokeWidth={9} />
          <path d={geometry.d} stroke="#0B2A4A" strokeWidth={4.5} />
        </g>
        {geometry.pins.map((pin) => (
          <g key={pin.number} transform={`translate(${pin.x} ${pin.y})`}>
            {pin.number === lastNumber && (
              <circle r={16} fill="#fff" stroke="#0B2A4A" strokeWidth={2.5} />
            )}
            <circle r={12} fill="#0B2A4A" stroke="#fff" strokeWidth={2.5} />
            <text y={4} textAnchor="middle" fontSize={12} fontWeight={700} fill="#fff">
              {pin.number}
            </text>
          </g>
        ))}
        <ScaleBar metersPerPx={metersPerPixel(geometry.view)} />
        <NorthArrow />
      </svg>
      {image === 'loading' && <div className="skeleton absolute inset-0 print:hidden" />}
    </figure>
  );
}
