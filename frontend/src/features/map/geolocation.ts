import { useCallback, useEffect } from 'react';

import type { LatLng } from '@/shared/lib/geo';
import { toast } from '@/shared/ui';

import { useMapActions } from './hooks';
import { useMapStore, type LocationStatus, type UserLocation } from './store';

const FRESH_MS = 2 * 60_000;
const SILENT_TIMEOUT_MS = 2500;

function requestPosition(timeout: number): Promise<UserLocation> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('unsupported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          point: { lat: position.coords.latitude, lng: position.coords.longitude },
          accuracy: position.coords.accuracy,
          timestamp: Date.now(),
        }),
      reject,
      { enableHighAccuracy: true, timeout, maximumAge: FRESH_MS },
    );
  });
}

function isDenied(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === GeolocationPositionError.PERMISSION_DENIED
  );
}

interface UserLocationApi {
  /** Last known position (also drawn on the map as a blue dot). */
  location: UserLocation | null;
  status: LocationStatus;
  /** Asks the browser for the position, shows it and (by default) flies there. */
  locate: (options?: { fly?: boolean }) => Promise<LatLng | null>;
}

/** «Где я»: user geolocation with permission handling. */
export function useUserLocation(): UserLocationApi {
  const location = useMapStore((state) => state.userLocation);
  const status = useMapStore((state) => state.locationStatus);
  const { flyTo } = useMapActions();

  const locate = useCallback(
    async ({ fly = true }: { fly?: boolean } = {}) => {
      const { setLocationStatus, setUserLocation } = useMapStore.getState();
      setLocationStatus('locating');
      try {
        const found = await requestPosition(10_000);
        setUserLocation(found);
        if (fly) flyTo(found.point, { minZoom: 15 });
        return found.point;
      } catch (error) {
        const denied = isDenied(error);
        setLocationStatus(denied ? 'denied' : 'unavailable');
        toast.info(
          denied
            ? 'Доступ к геолокации запрещён — разрешите его в настройках браузера'
            : 'Не удалось определить местоположение',
        );
        return null;
      }
    },
    [flyTo],
  );

  return { location, status, locate };
}

/**
 * Best-effort position for background use (e.g. attaching coordinates to a vote).
 * Never shows a permission prompt: returns the last fresh fix, or asks the browser only
 * when access has already been granted.
 */
export async function resolveUserLocation(): Promise<LatLng | null> {
  const { userLocation, setUserLocation } = useMapStore.getState();
  if (userLocation && Date.now() - userLocation.timestamp < FRESH_MS) return userLocation.point;

  try {
    const permission = await navigator.permissions.query({ name: 'geolocation' });
    if (permission.state !== 'granted') return null;
    const found = await requestPosition(SILENT_TIMEOUT_MS);
    setUserLocation(found);
    return found.point;
  } catch {
    return null;
  }
}

/**
 * Keeps the user location live while `enabled` (e.g. walking a route): the blue dot moves
 * and `useUserLocation().location` updates with every fix. Asks for permission once; a
 * refusal only sets `status` to `denied` — no toast, the caller explains it in place.
 */
export function useWatchUserLocation(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !('geolocation' in navigator)) return;
    const { setLocationStatus, setUserLocation } = useMapStore.getState();
    const id = navigator.geolocation.watchPosition(
      (position) =>
        setUserLocation({
          point: { lat: position.coords.latitude, lng: position.coords.longitude },
          accuracy: position.coords.accuracy,
          timestamp: Date.now(),
        }),
      (error) => setLocationStatus(isDenied(error) ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);
}
