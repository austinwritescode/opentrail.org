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