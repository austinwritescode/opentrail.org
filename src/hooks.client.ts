import { dev } from '$app/environment';
import { handleErrorWithSentry, replayIntegration } from "@sentry/sveltekit";
import * as Sentry from '@sentry/sveltekit';

if (!dev) {
Sentry.init({
    dsn: 'https://ce5b7f4bfa0d91de3163c9daa500b484@o4511352687951872.ingest.us.sentry.io/4511352688279552',

    tracesSampleRate: 1.0,

    enableLogs: true,

    replaysSessionSampleRate: 0.1,

    replaysOnErrorSampleRate: 1.0,

    integrations: [replayIntegration()],

    sendDefaultPii: false,

  beforeSend(event) {
    const err = event.exception?.values?.[0];
    const isNetworkError = /failed to fetch|networkerror|network request failed|load failed/i.test(err?.value || '');
    if (isNetworkError && !navigator.onLine) return null;
    return event;
  },
  });
}

export const handleError = handleErrorWithSentry();
