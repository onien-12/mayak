/**
 * Registers the app-shell service worker (built by `pwa/serviceWorkerPlugin.ts`) — production
 * only, after the page has loaded, so it never competes with the first paint. Failing to
 * register is not an error for the app: it simply runs as an ordinary site.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
