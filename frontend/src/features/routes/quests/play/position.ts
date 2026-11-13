export interface Position {
  lat: number;
  lng: number;
  /** Metres, as the phone reports it. */
  accuracy: number;
}

const TIMEOUT_MS = 15_000;
const FRESH_MS = 10_000;

/** One precise fix for a stage check; asks for permission the first time. */
export function currentPosition(): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('unsupported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        resolve({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy }),
      reject,
      { enableHighAccuracy: true, timeout: TIMEOUT_MS, maximumAge: FRESH_MS },
    );
  });
}

export function positionProblem(error: unknown): string {
  const denied =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === GeolocationPositionError.PERMISSION_DENIED;
  return denied
    ? 'Без геолокации не проверить, что вы на месте — разрешите её в настройках браузера.'
    : 'Не удалось определить, где вы. Выйдите на открытое место и попробуйте ещё раз.';
}
