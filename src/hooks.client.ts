import { dev } from '$app/environment';
import {
  handleErrorWithSentry,
  replayIntegration,
  consoleLoggingIntegration,
  browserProfilingIntegration
} from '@sentry/sveltekit';
import * as Sentry from '@sentry/sveltekit';
import { get } from 'svelte/store';
import { settings } from '$lib/store.js';

function shouldDrop() {
  return get(settings).sendCrashReports === false;
}

if (!dev) {
  Sentry.init({
  dsn: 'https://ce5b7f4bfa0d91de3163c9daa500b484@o4511352687951872.ingest.us.sentry.io/4511352688279552',
  
  enableLogs: true,
  tracesSampleRate: 0.2,
  profilesSampleRate: 0.2,
  replaysSessionSampleRate: 0.2,
  replaysOnErrorSampleRate: 1.0,
  profileLifecycle: 'trace',
  sendDefaultPii: false,

  integrations: function (integrations) {
    return integrations
      .filter((i) => i.name !== 'GlobalHandlers')
      .concat([
        replayIntegration({ canvas: true }),
        consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] }),
        browserProfilingIntegration()
      ]);
  },

  beforeSend(event) {
    if (shouldDrop()) return null;
    return event;
  },

  beforeSendLog(log) {
    if (shouldDrop()) return null;
    return log;
  },

  beforeSendMetric(metric) {
    if (shouldDrop()) return null;
    return metric;
  }
  });
}

export const handleError = handleErrorWithSentry();
