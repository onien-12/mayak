import { routesApi, errorMessage } from '@/shared/api';
import { toast } from '@/shared/ui';

/** Absolute link to the route page (used for sharing and the QR code). */
export function routeUrl(id: number): string {
  return `${window.location.origin}/routes/${id}`;
}

/** Native share sheet when available, otherwise copies the link. */
export async function shareRoute(route: { id: number; title: string }): Promise<void> {
  const url = routeUrl(route.id);
  try {
    if (navigator.share) {
      await navigator.share({ title: route.title, url });
      return;
    }
    await navigator.clipboard.writeText(url);
    toast.success('Ссылка скопирована');
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) {
      toast.error('Не получилось поделиться ссылкой');
    }
  }
}

function fileName(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'route'}.gpx`;
}

/**
 * Downloads the GPX track (waypoints + track) of a route; works for private routes too.
 * Rejects with an `ApiError` — callers decide how to report it.
 */
export async function downloadGpx(route: { id: number; title: string }): Promise<void> {
  const blob = await routesApi.gpx(route.id);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName(route.title);
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** `downloadGpx` with toasts — inside the app shell. */
export async function downloadGpxWithToast(route: { id: number; title: string }): Promise<void> {
  try {
    await downloadGpx(route);
    toast.success('GPX-трек скачан — откройте его в навигаторе или трекере');
  } catch (error) {
    toast.error(errorMessage(error));
  }
}
