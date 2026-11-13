import { MapDots, MapHtmlMarker } from '@/features/map';
import type { OutageBuildingPoint } from '@/shared/api';
import type { LatLng } from '@/shared/lib/geo';

import { HOUSE_DOTS_MIN_ZOOM, type HouseDots } from './useHouseDots';

const DOT_SIZE = 11;
const MIXED_DOT_SIZE = 15;
const RING_SIZE = 44;

/** The house picked in «Проверить адрес», marked with a pulsing beam ring. */
export function CheckedHouseMarker({ position }: { position: LatLng }) {
  return (
    <MapHtmlMarker position={position} anchor={[RING_SIZE / 2, RING_SIZE / 2]} passive>
      <span aria-hidden className="relative flex size-11 items-center justify-center">
        <span className="absolute inset-0 animate-pulse-ring rounded-full bg-beam/60" />
        <span className="size-4 rounded-full border-[3px] border-white bg-brand shadow-pin" />
      </span>
    </MapHtmlMarker>
  );
}

interface HouseDotsLayerProps {
  dots: HouseDots;
  onHouse: (house: OutageBuildingPoint) => void;
}

/** House dots coloured by resource; navy and larger when several resources are off at once. */
export function HouseDotsLayer({ dots, onHouse }: HouseDotsLayerProps) {
  const open = (id: string | number) => {
    const house = dots.byAddress.get(String(id));
    if (house) onHouse(house);
  };

  return (
    <>
      <MapDots dots={dots.single} minZoom={HOUSE_DOTS_MIN_ZOOM} size={DOT_SIZE} onClick={open} />
      <MapDots
        dots={dots.mixed}
        minZoom={HOUSE_DOTS_MIN_ZOOM}
        size={MIXED_DOT_SIZE}
        onClick={open}
      />
    </>
  );
}
