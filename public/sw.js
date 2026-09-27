// Offline support for Hanzi Desk.
// - App shell (HTML, JS, CSS, icons): network-first for pages, cache-first for hashed assets.
// - Stroke-order data and pronunciation recordings: cache-first once downloaded.
// - Example sentences: saved for offline, refreshed in the background.
// - Sentence recordings: lesson indexes saved for offline and refreshed; the packs of recordings
//   (named by their contents) are saved the first time one is played, as they are too big to get up front.
// - Everything else (YouTube) goes straight to the network.
// Fonts are bundled under /_next/static/, so they are cached with the shell.
// Keep the cache names in sync with app/offline.ts.

const SHELL_CACHE = 'hanzi-shell-v1';
const STROKE_CACHE = 'hanzi-strokes-v2';
const AUDIO_CACHE = 'hanzi-audio-v2';
const SENTENCE_CACHE = 'hanzi-sentences-v1';
const SENTENCE_AUDIO_CACHE = 'hanzi-sentence-audio-v1';
const CACHES = [SHELL_CACHE, STROKE_CACHE, AUDIO_CACHE, SENTENCE_CACHE, SENTENCE_AUDIO_CACHE];

const SHELL_URLS = [
  '/',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  // Profile avatars (app/avatars.ts)
  ...['cat', 'tiger', 'rabbit', 'dragon', 'panda', 'horse'].map((avatar) => `/avatars/${avatar}.svg`),
];
const NAVIGATION_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(SHELL_URLS);
    // Also cache the scripts and styles the page references so the first offline launch works.
    const html = await (await cache.match('/')).text();
    const assets = [...html.matchAll(/(?:src|href)="(\/_next\/[^"]+)"/g)].map((match) => match[1]);
    await Promise.allSettled([...new Set(assets)].map((url) => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith('hanzi-') && !CACHES.includes(name)).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

// The page reports every same-origin asset it loaded, so lazily loaded chunks are cached too.
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'cache-urls' || !Array.isArray(event.data.urls)) return;
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.allSettled(event.data.urls.map(async (url) => {
      if (!(await cache.match(url))) await cache.add(url);
    }));
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(networkFirstPage(request));
  } else if (url.origin === self.location.origin && url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
  } else if (url.origin === self.location.origin && SHELL_URLS.includes(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
  } else if (url.origin === self.location.origin && url.pathname.startsWith('/strokes/')) {
    event.respondWith(cacheFirst(request, STROKE_CACHE));
  } else if (url.origin === self.location.origin && url.pathname.startsWith('/audio/')) {
    event.respondWith(cacheFirst(request, AUDIO_CACHE));
  } else if (url.origin === self.location.origin && url.pathname.startsWith('/sentence-audio/')) {
    event.respondWith(url.pathname.endsWith('.json') ? staleWhileRevalidate(request, SENTENCE_AUDIO_CACHE) : cacheFirst(request, SENTENCE_AUDIO_CACHE));
  } else if (url.origin === self.location.origin && url.pathname.startsWith('/sentences/')) {
    // Rebuilt sentence files keep their names, so refresh them in the background.
    event.respondWith(staleWhileRevalidate(request, SENTENCE_CACHE));
  }
});

async function networkFirstPage(request) {
  const cache = await caches.open(SHELL_CACHE);
  const network = fetch(request).then(async (response) => {
    // The whole app lives on one page, so every navigation shares the cached '/' shell.
    if (response.ok) await cache.put('/', response.clone());
    return response;
  });
  try {
    return await Promise.race([
      network,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Navigation timed out')), NAVIGATION_TIMEOUT_MS)),
    ]);
  } catch {
    // Offline, or a slow connection: use the saved copy, falling back to waiting on the network.
    return (await cache.match('/')) ?? network;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then(async (response) => {
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  return cached ?? (await network) ?? Response.error();
}
