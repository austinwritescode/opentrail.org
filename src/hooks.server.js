import {sequence} from '@sveltejs/kit/hooks';
import * as Sentry from '@sentry/sveltekit';
import { env } from '$env/dynamic/private'
import { dev } from '$app/environment';
import { initGeoJSON } from '$lib/geojson-cache.js'
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

if (!dev) {
Sentry.init({
dsn: "https://ce5b7f4bfa0d91de3163c9daa500b484@o4511352687951872.ingest.us.sentry.io/4511352688279552",
tracesSampleRate: 1,
enableLogs: true,
sendDefaultPii: false
})
}

initGeoJSON()

let cachedChunkCount = null;
function getChunkCount() {
	if (cachedChunkCount !== null) return cachedChunkCount;
	const p = resolve('.svelte-kit/output/client/__chunk_count.json');
	if (existsSync(p)) {
		try {
			const d = JSON.parse(readFileSync(p, 'utf8'));
			cachedChunkCount = d.total || 0;
		} catch {
			cachedChunkCount = 0;
		}
	} else {
		cachedChunkCount = 0;
	}
	return cachedChunkCount;
}

const hits = new Map()

function rateLimit(key, limit, windowMs) {
    const now = Date.now()
    const record = hits.get(key)
    if (!record || now - record.start > windowMs) {
        hits.set(key, { start: now, count: 1 })
        return true
    }
    if (record.count >= limit) return false
    record.count++
    return true
}

setInterval(() => {
    const cutoff = Date.now() - 3_600_000
    for (const [key, val] of hits) {
        if (val.start < cutoff) hits.delete(key)
    }
}, 3_600_000)

export const handleError = Sentry.handleErrorWithSentry(function _handleError({ error, event }) {
  const msg = error?.message || String(error);
  const is404 = msg.startsWith('Not found:');

  if (is404) {
    const url = event.url.pathname;
    const referer = event.request.headers.get('referer') || '';
    
    // 1. Precise Zombie Check
    if (url.startsWith('/_app/')) {
      console.warn(`[ZOMBIE] ${url}`);
      return { 
        message: 'App version mismatch — please refresh.', 
        code: 'VERSION_MISMATCH' 
      };
    }

    // 2. Broken Link Check (Best Effort)
    // Checks if the user was already on your site when they hit the 404
    if (referer.includes(event.url.host)) {
      console.error(`[BROKEN LINK] From ${referer} to ${url}`);
      return;
    }

    // 3. Scanner/Bot Silence
    return;
  }

  // 4. Real Server Crashes
  console.error('SERVER CRASH:', error);
});

export const handle = sequence(Sentry.sentryHandle(), async function _handle({ event, resolve }) {
  if (event.url.pathname.startsWith('/api/')) {
    const auth = event.request.headers.get('authorization')
    const key = auth ? auth.replace('Bearer ', '') : null
    if (key === env.MOD_KEY) return resolve(event)
    if (key !== null || event.request.method === 'POST') {
      const ip = event.getClientAddress()
      if (!rateLimit(ip, 100, 3_600_000)) {
        return new Response('Too Many Requests', { status: 429 })
      }
    }
  }
  return resolve(event, {
    transformPageChunk: ({ html }) => {
      const count = getChunkCount();
      return html.replace(
        '</head>',
        `<script>window.__CHUNK_COUNT=${count}</script></head>`
      );
    }
  });
});