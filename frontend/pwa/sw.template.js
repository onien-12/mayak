// Service worker of «Маяк». Generated at build time from pwa/sw.template.js — do not edit dist/sw.js.
//
// What it does: keeps the app shell (the page, its scripts, styles, fonts and icons) in a cache so the
// installed app opens instantly and without a connection. What it never touches: the API, uploaded
// media, map tiles and anything from another origin — data always comes from the network.

const VERSION = '__VERSION__';
const CACHE = `mayak-shell-${VERSION}`;
const PRECACHE = __PRECACHE__;
const SHELL_URL = '/';
/** How long a page load waits for the network before the cached shell is used. */
const NAVIGATION_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  // One file failing must not lose the whole shell: cache what can be cached.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        Promise.all(
          PRECACHE.map((url) =>
            cache.add(new Request(url, { cache: 'reload' })).catch(() => undefined),
          ),
        ),
      ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith('mayak-shell-') && name !== CACHE)
            .map((name) => caches.delete(name)),
        ),
      )
      // The very first install takes over the open page, so it is ready offline at once. Later
      // versions wait until the old pages are closed: they keep the files they were built with.
      .then(() => self.clients.claim()),
  );
});

function isAppData(url) {
  return url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/');
}

async function fromNetworkThenShell(request) {
  const cache = await caches.open(CACHE);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NAVIGATION_TIMEOUT_MS);
  try {
    const response = await fetch(request, { signal: controller.signal });
    if (response.ok) cache.put(SHELL_URL, response.clone());
    return response;
  } catch {
    const shell = await cache.match(SHELL_URL);
    if (shell) return shell;
    throw new Error('offline and the shell is not cached');
  } finally {
    clearTimeout(timer);
  }
}

async function fromCacheThenNetwork(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') {
    const cache = await caches.open(CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isAppData(url)) return;

  if (request.mode === 'navigate') {
    // Every route of the single-page app is the same shell; the network copy wins when reachable,
    // so a new deploy shows up on the next load.
    event.respondWith(fromNetworkThenShell(request));
    return;
  }
  if (url.pathname === '/sw.js') return;
  // Hashed bundles never change; icons and the manifest change only with a new worker.
  event.respondWith(fromCacheThenNetwork(request));
});
