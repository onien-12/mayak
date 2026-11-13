import { PenLine } from 'lucide-react';
import { useEffect } from 'react';

import { MapPolygon, usePickPoint } from '@/features/map';
import { formatDistance } from '@/shared/lib/format';
import type { LatLng } from '@/shared/lib/geo';
import { circlePolygon } from '@/shared/lib/polygon';
import { Button } from '@/shared/ui';

import { formatSquare } from '../lib/geometry';
import { DRAW_COLOR } from './DrawLayer';
import type { BoundsDraft } from './useBoundsDraft';

const MIN_RADIUS_M = 50;
const MAX_RADIUS_M = 2000;
const RADIUS_STEP_M = 10;

/** «Круг»: the centre is the pin in the middle of the map, the radius is a slider. */
export function CircleMode({ draft, initial }: { draft: BoundsDraft; initial?: LatLng }) {
  const { point } = usePickPoint(true, initial);
  const { setCenter, radiusM, setRadiusM, geometry } = draft;

  useEffect(() => {
    if (point) setCenter(point);
  }, [point, setCenter]);

  return (
    <div className="flex flex-col gap-3">
      {point && (
        <MapPolygon
          geometry={circlePolygon(point, radiusM)}
          color={DRAW_COLOR}
          fillOpacity={0.2}
          strokeOpacity={0.95}
          strokeWidth={2.5}
          zIndex={4}
        />
      )}
      <label className="flex flex-col gap-2" data-sheet-ignore>
        <span className="flex items-baseline justify-between text-sm">
          <span className="text-ink-soft">Радиус</span>
          <span className="font-semibold text-ink tabular-nums">
            {formatDistance(radiusM)}
            {geometry && (
              <span className="font-normal text-ink-faint">
                {' '}
                · {formatSquare(Math.PI * radiusM ** 2)}
              </span>
            )}
          </span>
        </span>
        <input
          type="range"
          min={MIN_RADIUS_M}
          max={MAX_RADIUS_M}
          step={RADIUS_STEP_M}
          value={radiusM}
          onChange={(event) => setRadiusM(Number(event.target.value))}
          className="h-11 w-full cursor-pointer accent-brand"
        />
      </label>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-ink-faint">Двигайте карту — центр круга под булавкой.</p>
        <Button
          size="sm"
          variant="ghost"
          icon={PenLine}
          disabled={!geometry}
          onClick={draft.refine}
        >
          Уточнить вручную
        </Button>
      </div>
    </div>
  );
}
