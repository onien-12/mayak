import { cn } from '@/shared/lib/cn';

import { MapFallback } from './MapFallback';
import { useMap } from './mapContext';
import { PickPointOverlay } from './PickPointOverlay';
import { PlaceMarkers } from './PlaceMarkers';
import { UserLocationMarker } from './UserLocationMarker';
import { ViewportSync } from './ViewportSync';

/**
 * The always-mounted map surface: the MapGL container plus the built-in layers (place
 * markers, user location, pick-point pin). Render it once, in the app shell.
 */
export function MapHost({ className }: { className?: string }) {
  const { registerContainer, status } = useMap();

  return (
    <div className={cn('absolute inset-0 z-0 overflow-hidden bg-[#e9eef2]', className)}>
      <div ref={registerContainer} className="mapgl-host size-full" />
      {status === 'ready' ? (
        <>
          <ViewportSync />
          <PlaceMarkers />
          <UserLocationMarker />
          <PickPointOverlay />
        </>
      ) : (
        <MapFallback status={status} />
      )}
    </div>
  );
}
