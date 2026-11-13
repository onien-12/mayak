import { MapHtmlMarker } from './MapHtmlMarker';
import { useMapStore } from './store';

const DOT = 20;

/** Blue "you are here" dot with a soft pulse. */
export function UserLocationMarker() {
  const location = useMapStore((state) => state.userLocation);
  if (!location) return null;

  return (
    <MapHtmlMarker position={location.point} anchor={[DOT / 2, DOT / 2]} zIndex={50} passive>
      <span
        role="img"
        aria-label="Вы здесь"
        style={{ width: DOT, height: DOT }}
        className="pointer-events-none relative flex items-center justify-center"
      >
        <span className="absolute inset-0 animate-pulse-ring rounded-full bg-official/50 lite:scale-150 lite:opacity-50" />
        <span className="relative size-4 rounded-full border-[3px] border-white bg-official shadow-pin" />
      </span>
    </MapHtmlMarker>
  );
}
