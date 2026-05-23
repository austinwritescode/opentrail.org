/** @type {WakeLockSentinel | null} */
var sentinel = null;

var active = false;

async function onVisibilityChange() {
  if (document.visibilityState === 'visible' && active) {
    await request();
  }
}

export async function request() {
  try {
    if ('wakeLock' in navigator) {
      sentinel = await navigator.wakeLock.request('screen');
      sentinel.addEventListener('release', () => {
        sentinel = null;
      });
    }
  } catch (e) {
    import('@sentry/sveltekit').then((S) => S.metrics.count('client.wakelock.error', 1)).catch(() => {});
  }
}

export function release() {
	if (sentinel) {
		sentinel.release();
		sentinel = null;
	}
}

export function hold() {
	if (active) return;
	active = true;
	request();
	document.addEventListener('visibilitychange', onVisibilityChange);
}

export function unhold() {
	active = false;
	document.removeEventListener('visibilitychange', onVisibilityChange);
	release();
}
