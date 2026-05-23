# OpenTrail

Community-driven trail information resource for thru-hikers.



## Getting Started

```
npm install
npm run dev
```

## API

### GET /api/getData

Returns trail markers as a GeoJSON FeatureCollection.

**Query parameters:**

- `trail` (required) — Trail name: `PCT`, `AT`, or `CDT`

**Example:**

```
GET /api/getData?trail=PCT
```

**Response:** `200` — GeoJSON `FeatureCollection` of `Point` features. Each feature's `properties` includes `title`, `mile`, `elev`, `desc`, `icons`, `images`, `comments`, `commentCount`, and `dbid`.

Supports `ETag`/`If-None-Match` (returns `304` if unchanged). Errors return `400`.