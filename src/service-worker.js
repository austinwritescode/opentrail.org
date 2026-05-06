import { build, files, version } from '$service-worker'
const CACHE = `cache-${version}`
const ASSETS = [
  ...build,
  ...files,
  '/', //causing android chrome to cache SW?
  `/app`,
  `/app/list`,
  `/app/profile`,
  `/app/settings`,
  'https://cdn.opentrail.org/style-outdoors.json',
  'https://cdn.opentrail.org/sprite@2x.json',
  'https://cdn.opentrail.org/sprite@2x.png',
  'https://cdn.opentrail.org/fonts/DIN%20Pro%20Bold,Arial%20Unicode%20MS%20Bold/0-255.font',
  'https://cdn.opentrail.org/fonts/DIN%20Pro%20Bold,Arial%20Unicode%20MS%20Bold/8192-8447.font',
  'https://cdn.opentrail.org/fonts/DIN%20Pro%20Italic,Arial%20Unicode%20MS%20Regular/0-255.font',
  'https://cdn.opentrail.org/fonts/DIN%20Pro%20Italic,Arial%20Unicode%20MS%20Regular/8192-8447.font',
  'https://cdn.opentrail.org/fonts/DIN%20Pro%20Medium,Arial%20Unicode%20MS%20Regular/0-255.font',
  'https://cdn.opentrail.org/fonts/DIN%20Pro%20Medium,Arial%20Unicode%20MS%20Regular/8192-8447.font',
  'https://cdn.opentrail.org/fonts/DIN%20Pro%20Regular,Arial%20Unicode%20MS%20Regular/0-255.font',
  'https://cdn.opentrail.org/fonts/DIN%20Pro%20Regular,Arial%20Unicode%20MS%20Regular/8192-8447.font',
  'https://cdn.opentrail.org/fonts/DIN%20Pro%20Regular,Arial%20Unicode%20MS%20Regular/9472-9727.font',
  'https://cdn.opentrail.org/fonts/DIN%20Pro%20Regular,Arial%20Unicode%20MS%20Regular/9728-9983.font',
];
const dontDelete = [
  CACHE,
  'offline-cache',
  'image-cache'
];

const tryCache = () => caches.open(CACHE).then(c => c.addAll(ASSETS));
self.addEventListener('install', (event) => {
  console.log('Service worker installing. Cache version: ' + CACHE);
  event.waitUntil(tryCache().catch(tryCache).catch(tryCache));
});

self.addEventListener('activate', (event) => {
  console.log('Service worker activating. Cache version: ' + CACHE)
  event.waitUntil(
    caches.keys().then((keyList) =>
      Promise.all(
        keyList.map((key) => {
          if (!(dontDelete.includes(key))) {
            console.log('Service worker deleting old cache: ' + key)
            return caches.delete(key);
          }
        })
      )
    )
  )
  return self.clients.claim();
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

async function handleRangeRequest(request) {
  const cache = await caches.open('offline-cache');
  const cached = await cache.match(request.url);
  if (!cached) return fetch(request);
  const full = await cached.arrayBuffer();
  const rangeHeader = request.headers.get('Range');
  if (!rangeHeader) return cached;
  const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
  if (!match) return cached;
  const start = parseInt(match[1]);
  const end = match[2] ? parseInt(match[2]) : full.byteLength - 1;
  const slice = full.slice(start, end + 1);
  return new Response(slice, {
    status: 206,
    headers: {
      'Content-Range': `bytes ${start}-${end}/${full.byteLength}`,
      'Content-Length': String(slice.byteLength),
      'Content-Type': 'application/octet-stream'
    }
  });
}

self.addEventListener('fetch', (event) => {
  const requestURL = new URL(event.request.url)
  //getData API uses network-first strategy to avoid stale data while online
  if (requestURL.pathname === '/api/getData') {
    event.respondWith(fetch(event.request).catch((error) => {
      return caches.open('offline-cache').then((cache) => {
        return cache.match(event.request)
      })
    }))
  }
  //handle range requests for cached PMTiles files (offline tile serving)
  else if (event.request.headers.has('Range') && requestURL.pathname.endsWith('.pmtiles')) {
    event.respondWith(handleRangeRequest(event.request));
  }
  //everything else is static so use cache-first:
  else {
    event.respondWith(caches.match(event.request).then((res) => {
      return res || fetch(event.request)
    }))
  }
})
