import { dev } from '$app/environment';
import { handleErrorWithSentry, replayIntegration } from "@sentry/sveltekit";
import * as Sentry from '@sentry/sveltekit';
import { get } from 'svelte/store';
import { settings } from '$lib/store.js';

if (!dev) {
  Sentry.init({
    dsn: 'https://ce5b7f4bfa0d91de3163c9daa500b484@o4511352687951872.ingest.us.sentry.io/4511352688279552',

    tracesSampleRate: 1.0,

    enableLogs: true,

    replaysSessionSampleRate: 0.01,

    replaysOnErrorSampleRate: 1.0,

    integrations: [replayIntegration({ canvas: true })],

    sendDefaultPii: false,

    beforeSend(event) {
      if (get(settings).sendCrashReports === false) return null;
      return event;
    },
  });
}

export const handleError = handleErrorWithSentry();
