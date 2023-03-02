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
    'https://cdn.opentrail.org/@2x.json',
    'https://cdn.opentrail.org/@2x.png',
    'https://cdn.opentrail.org/fonts/DIN%20Pro%20Bold,Arial%20Unicode%20MS%20Bold/0-255.font',
    'https://cdn.opentrail.org/fonts/DIN%20Pro%20Bold,Arial%20Unicode%20MS%20Bold/8192-8447.font',
    'https://cdn.opentrail.org/fonts/DIN%20Pro%20Italic,Arial%20Unicode%20MS%20Regular/0-255.font',
    'https://cdn.opentrail.org/fonts/DIN%20Pro%20Italic,Arial%20Unicode%20MS%20Regular/8192-8447.font',
    'https://cdn.opentrail.org/fonts/DIN%20Pro%20Medium,Arial%20Unicode%20MS%20Regular/0-255.font',
    'https://cdn.opentrail.org/fonts/DIN%20Pro%20Medium,Arial%20Unicode%20MS%20Regular/8192-8447.font',
    'https://cdn.opentrail.org/fonts/DIN%20Pro%20Regular,Arial%20Unicode%20MS%20Regular/0-255.font',
    'https://cdn.opentrail.org/fonts/DIN%20Pro%20Regular,Arial%20Unicode%20MS%20Regular/8192-8447.font',
];
const dontDelete = [
    CACHE,
    'mapbox-tiles', //not sure what this is for but let's not mess with it
    'offline-cache'
];

self.addEventListener('install', (event) => {
    console.log('Service worker installing. Cache version: ' + CACHE)
    self.skipWaiting()
    event.waitUntil(caches.open(CACHE).then((cache) => {
        // ASSETS.forEach(async (asset) => {
        //     console.log(`fetching asset ${asset}`)
        //     await cache.add(asset)
        // })
        return cache.addAll(ASSETS)
    }))
})

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
    //everything else is static so use cache-first:
    else {
        event.respondWith(caches.match(event.request).then((res) => {
            return res || fetch(event.request)
        }))
    }
})

addEventListener('backgroundfetchsuccess', (event) => {
    console.log('bgFetch success');
    const bgFetch = event.registration;
    event.waitUntil(
        (async function () {
            const cache = await caches.open(bgFetch.id);
            const records = await bgFetch.matchAll();
            const promises = records.map(async (record) => {
                const response = await record.responseReady;
                await cache.put(record.request, response);
            });
            await Promise.all(promises);
            console.log('bgFetch finished caching');
            event.updateUI({ title: 'Opentrail offline ready!' });

            const clients = await self.clients.matchAll({
                includeUncontrolled: false,
                type: 'window',
            })
            if (clients) {
                for (const client of clients) client.postMessage({ type: 'BGFETCH_SUCCESS' });
            }
        })()
    );
});

addEventListener('backgroundfetchfail', (event) => {
    event.waitUntil(
        (async function () {
            event.updateUI({ title: 'Opentrail offline failed' });
            const clients = await self.clients.matchAll({
                includeUncontrolled: false,
                type: 'window',
            })
            if (clients) {
                for (const client of clients) client.postMessage({ type: 'BGFETCH_FAILURE' });
            }
        })()
    )
})