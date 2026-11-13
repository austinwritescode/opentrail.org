# OpenTrail

OpenTrail is a community-driven Progressive Web App for long-distance hikers. It brings trail maps, elevation profiles, waypoint information and recent community reports into a responsive interface for phones and desktop browsers.

The app includes the Pacific Crest Trail (PCT), Appalachian Trail (AT) and Continental Divide Trail (CDT), plus a small test trail for development.

## Features

- **Interactive trail maps:** vector maps, waypoint markers, geolocation, distance measurement and an elevation profile for the visible trail.
- **Waypoint discovery:** search, type filters, mileage and elevation, with previews on the map and full detail views.
- **Community contributions:** waypoint submissions, photos, comments and reporting tools, supported by moderation endpoints.
- **Offline support:** downloadable trail maps, locally cached waypoint data and queued contributions for later synchronization.
- **Personal preferences:** northbound or southbound mileage, metric or imperial units, date formats and a green dark theme.
- **Installable PWA:** a home-screen experience with service-worker updates and responsive mobile and desktop layouts.

## Quick start: local design preview

Use demo mode to explore the interface without a database or service credentials. From the repository root:

```sh
npm ci
npm run dev:demo
```

The command opens [the local test trail](http://localhost:5174/app?trail=test). Keep the terminal running; stop the server with **Ctrl+C**.

Demo mode provides four fictional waypoints and sample comments. Maps, navigation, search, filters, settings and forms can be explored. Submissions, uploads and moderation return a clear demo-mode error rather than saving data. Other trails display their maps without sample waypoints.

Demo mode is available only through the development server. It still requires internet access to load trail geometry and map tiles from the CDN.

### Preview mobile layouts

In Chrome or Edge, open developer tools with **F12**, then toggle the device toolbar with **Ctrl+Shift+M**.

To preview on a phone connected to the same network:

```sh
npm run dev:demo -- --host 0.0.0.0
```

Open the Network URL printed in the terminal on the phone. Plain HTTP over a local network is suitable for visual checks, but geolocation, service workers and some storage features require a secure context. Use HTTPS when testing those features on a physical device; desktop localhost is treated as a secure context.

## Development with the backend

### Prerequisites

- Node.js and npm. Local development has been verified with Node.js 24; the repository's Dockerfile currently uses Node.js 20. Dependency engine requirements are enforced through `.npmrc`.
- PostgreSQL for the application database.
- Internet access to the trail and map assets hosted at `cdn.opentrail.org`.
- Credentials for the additional services you intend to exercise, listed below.

### Setup

1. Install the locked dependencies:

   ```sh
   npm ci
   ```

2. Create a `.env` file in the repository root with a connection to a development database:

   ```dotenv
   DATABASE_URL="postgresql://opentrail:password@localhost:5432/opentrail?schema=public"
   ```

3. Apply the committed migrations to the development database and generate the Prisma client:

   ```sh
   npx prisma migrate deploy
   npx prisma generate
   ```

   See [the Prisma schema](prisma/schema.prisma) for the data model. No seed script is provided: trail records and waypoint data must be populated separately, or restored from a development snapshot. Creating tables alone does not populate a trail.

4. Start the development server:

   ```sh
   npm run dev
   ```

   Open the local URL printed by Vite, normally `http://localhost:5173`.

Use development databases and storage for submission testing. Demo mode is the simplest option when working only on the interface.

### Configuration

| Variable                                     | Purpose                                                                                  |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `DATABASE_URL`                               | PostgreSQL connection used by Prisma. Required for database-backed API routes.           |
| `GOOGLE_MAPS_API_KEY`                        | Elevation lookup when creating markers or changing their locations.                      |
| `S3_ENDPOINT`                                | Endpoint for S3-compatible image storage.                                                |
| `S3_ACCESS_ID`, `S3_SECRET_KEY`              | Credentials for image uploads and deletion.                                              |
| `MOD_KEY`                                    | Server-side key used by moderation routes.                                               |
| `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_API_TOKEN` | Runtime cache invalidation after data changes. Purging is skipped when these are absent. |
| `SENTRY_AUTH_TOKEN`                          | Build-time authentication for Sentry releases and source-map uploads.                    |
| `APP_VERSION`, `APP_LASTMOD`                 | Build-time version and date metadata.                                                    |
| `TILE_URL`                                   | Tile source template used by the PMTiles generation utility.                             |

Image storage currently uses the `opentrail-static` bucket and the `img` prefix in the server code. The CDN URLs and Sentry project settings are also configured in source. A separate deployment needs those settings reviewed alongside its environment variables.

Keep credentials out of source control. Development environment files are not a substitute for configuring the production process environment.

## Project structure

```text
src/
  lib/                 Shared components, application state and map/offline utilities
    assets/icons/      Supplied SVG interface and waypoint icons
    server/            Server-only utilities and local demo responses
  routes/
    app/               Map, waypoints, comments and settings interface
    api/               Data, contribution and moderation endpoints
  app.css              Shared styles and responsive layouts
  hooks.server.js      Request handling, demo routing and server initialization
  service-worker.js    Application caching and update lifecycle
static/                PWA manifest, application icons, fonts and brand assets
prisma/                Database schema and historical migrations
scripts/               Trail-data import, mileage and tile-generation utilities
.github/workflows/     Deployment automation
```

The application uses **SvelteKit and Svelte**, **Tailwind CSS and DaisyUI**, **MapLibre GL and PMTiles**, **Prisma and PostgreSQL**, and **Dexie/IndexedDB** with the **Origin Private File System (OPFS)** for local data and offline maps. Sentry provides error reporting and instrumentation.

## Offline behaviour

The service worker caches application resources. Waypoint data is stored locally, while downloaded map archives use OPFS. Offline settings expose download, synchronization and storage-related controls; pending contributions are synchronized when connectivity returns.

Offline capability depends on browser support, available storage and successful downloads. Loading the app once does not download every trail map. Test a completed trail download before disconnecting, and check pending uploads after reconnecting. Installation and persistent-storage behaviour vary by browser.

## Commands and validation

| Command               | Description                                     |
| --------------------- | ----------------------------------------------- |
| `npm run dev`         | Start the normal development server.            |
| `npm run dev:demo`    | Start the database-free preview on port 5174.   |
| `npm run build`       | Build the production client and Node.js server. |
| `npm run preview`     | Serve a local preview of the production build.  |
| `npm start`           | Run the generated Node.js server from `build/`. |
| `npm run check`       | Run Svelte and TypeScript diagnostics.          |
| `npm run check:watch` | Run diagnostics continuously.                   |
| `npm run lint`        | Check formatting and run ESLint.                |
| `npm run format`      | Format the repository with Prettier.            |

The repository currently has pre-existing type-check diagnostics; a successful production build does not imply a clean `npm run check`. There is no committed `npm test` command. When contributing, run the relevant checks and distinguish existing failures from regressions.

For interface changes, verify desktop and mobile layouts, light and dark themes, keyboard navigation, waypoint previews and detail dialogs. For data or offline changes, also verify synchronization, error handling and recovery after reconnecting.

## Production and deployment

The project uses `@sveltejs/adapter-node` and produces a Node.js application in `build/`:

```sh
npm ci
npx prisma generate
npm run build
npm start
```

Supply runtime credentials through the process environment. `PORT` controls the listening port; the container is configured for port `8080`. Running `npm start` does not load a local `.env` file automatically.

The repository includes a multi-stage [Dockerfile](Dockerfile), [Fly.io configuration](fly.toml) and a [GitHub Actions deployment workflow](.github/workflows/fly.yml). The workflow runs on pushes to `main`, derives version metadata from Git, deploys to Fly.io and purges the Cloudflare cache.

The workflow expects these GitHub Actions secrets:

- `FLY_API_TOKEN`
- `SENTRY_AUTH_TOKEN`
- `CLOUDFLARE_ZONE`
- `CLOUDFLARE_TOKEN`

The workflow's Cloudflare secret names differ from the runtime variables in the configuration table. Database provisioning and migration execution are not performed by this deployment workflow. Demo mode is not a production deployment option.

## API overview

### Retrieve trail waypoints

```http
GET /api/getData?trail=PCT
```

The `trail` parameter identifies a configured trail: `PCT`, `AT`, `CDT` or `test`.

A successful response is a GeoJSON `FeatureCollection` containing point features. Each feature includes longitude/latitude coordinates and properties such as `title`, `mile`, `elev`, `desc`, `icons`, `images`, `comments`, `commentCount` and `dbid`.

The endpoint supports `ETag` and `If-None-Match`, returning `304` when the data is unchanged. Request failures return `400`.

Contribution endpoints include `/api/postMarker`, `/api/postComment`, `/api/postImage` and `/api/postFlag`. Moderation and deletion have separate protected routes. These endpoints have operation-specific payloads and validation; consult [the route implementations](src/routes/api) before building an integration.

## Troubleshooting

| Symptom                                               | What to check                                                                                                                                       |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database errors during local testing                  | Use `npm run dev:demo` for interface work, or configure `DATABASE_URL` and provision the development schema.                                        |
| Map or trail data does not load                       | Check connectivity to `cdn.opentrail.org` and inspect failed requests in browser developer tools. Demo mode also needs these assets.                |
| Port 5174 is already in use                           | Stop the existing demo server or pass a different port, such as `npm run dev:demo -- --port 5175`.                                                  |
| Geolocation or installation is unavailable on a phone | Check HTTPS, browser permissions and PWA support. A plain HTTP LAN preview does not expose every feature.                                           |
| Images cannot be uploaded                             | Check the S3 credentials, endpoint and bucket configuration. Uploads are deliberately disabled in demo mode.                                        |
| Local changes appear stale                            | Reload the page and inspect service-worker registrations. Clear site data only after checking for unsynchronized contributions and downloaded maps. |
| Dependency installation reports an engine mismatch    | Check the installed Node.js version against the dependency requirements; `.npmrc` enables strict engine checks.                                     |

## Contributing

Keep changes focused and describe the user-visible result in the pull request. Include relevant validation and screenshots for visual changes. Use the shared components, design tokens and SVG assets so map controls, lists and dialogs remain consistent. Test submissions against development services, and document any configuration or database changes alongside the implementation.
