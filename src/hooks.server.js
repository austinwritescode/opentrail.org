import { env } from '$env/dynamic/private'

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

export async function handle({ event, resolve }) {
    if (event.url.pathname.startsWith('/api/')) {
        const auth = event.request.headers.get('authorization')
        const key = auth ? auth.replace('Bearer ', '') : null
        if (key === env.MOD_KEY) return resolve(event)
        if (key !== null || event.request.method === 'POST') {
            const ip = event.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || event.getClientAddress()
            if (!rateLimit(ip, 100, 3_600_000)) {
                return new Response('Too Many Requests', { status: 429 })
            }
        }
    }
    return resolve(event)
}

/** @type {import('@sveltejs/kit').HandleServerError} */
export function handleError({ error, event }) {
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
}