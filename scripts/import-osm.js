#!/usr/bin/env node
import { PrismaClient } from '@prisma/client'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { resolve } from 'path'
import { decodeTrail } from '../src/lib/decode-trail.js'
import fetch from 'node-fetch'

function deg2rad(deg) { return deg * (Math.PI / 180) }

function haversine(lat1, lon1, lat2, lon2) {
  const R = 3958.8
  const dLat = deg2rad(lat2 - lat1)
  const dLon = deg2rad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function searchTrailRoute(lng, lat, geoJSON, maxDist) {
  const coords = geoJSON.features[0].geometry.coordinates
  let min = { dist: maxDist, index: -1 }
  coords.forEach((coord, index) => {
    const dist = haversine(coord[1], coord[0], lat, lng)
    if (dist < min.dist) min = { dist, index }
  })
  return min
}

loadEnv('.env')

function loadEnv(path) {
  try {
    for (const line of readFileSync(resolve(path), 'utf8').split('\n')) {
      if (line.startsWith('#') || !line.includes('=')) continue
      const [key, ...rest] = line.split('=')
      const trimmed = key.trim()
      if (!process.env[trimmed]) {
        process.env[trimmed] = rest.join('=').trim().replace(/^["']|["']$/g, '')
      }
    }
  } catch {}
}

const TRAILS = {
  PCT: { bounds: [[-123.8, 32.3], [-116.2, 49.2]] },
  AT: { bounds: [[-84.4, 34.4], [-68.7, 46.1]] },
  CDT: { bounds: [[-114.1, 31.1], [-105.5, 49.2]] },
  test: { bounds: [[-117.0321, 42.0008], [-117.0263, 42.0048]] }
}

const ICON_ORDER = ['a', 's', 'w', 'c', 'j', 't', 'o']
const OVERPASS_DEFAULT = 'https://overpass-api.de/api/interpreter'
const DATA_DIR = resolve('data/osm-overpass')
const GOOG_ELEV_URL = 'https://maps.googleapis.com/maps/api/elevation/json'
const GOOG_ELEV_BATCH = 512

const prisma = new PrismaClient()

// ── Args ──────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2)
  const opts = {
    trail: null,
    apply: false,
    write: false,
    resolve: null,
    campRadius: 1,
    poiRadius: 0.25,
    overlap: 100,
    overpass: OVERPASS_DEFAULT,
    noCache: false,
    chunk: 50
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--apply') opts.apply = true
    else if (a === '--write') opts.write = true
    else if (a === '--no-cache') opts.noCache = true
    else if (a === '--resolve' && args[i + 1]) opts.resolve = args[++i]
    else if (a === '--camp-radius' && args[i + 1]) opts.campRadius = parseFloat(args[++i])
    else if (a === '--poi-radius' && args[i + 1]) opts.poiRadius = parseFloat(args[++i])
    else if (a === '--overlap' && args[i + 1]) opts.overlap = parseInt(args[++i])
    else if (a === '--overpass' && args[i + 1]) opts.overpass = args[++i]
    else if (a === '--chunk' && args[i + 1]) opts.chunk = parseInt(args[++i])
    else if (!a.startsWith('-') && !opts.trail) opts.trail = a
  }
  return opts
}

function usage() {
  console.log(`Usage:
  node scripts/import-osm.js <trail> [options]         Phase 1: fetch & classify
  node scripts/import-osm.js <trail> --apply [options]  Phase 2: apply decisions

Arguments:
  trail          Trail name (PCT, AT, CDT)

Options:
  --resolve <strategy> Auto-resolve all undecided conflicts (skip/merge/new/replace)
  --camp-radius <miles> Max distance for campsite/shelter markers (default: 1)
  --poi-radius <miles>  Max distance for all other markers (default: 0.25)
  --overlap <meters>    Duplicate detection distance (default: 100)
  --overpass <url>      Overpass API endpoint
  --no-cache            Re-fetch from Overpass even if cached
  --chunk <miles>       Chunk size for Overpass queries (default: 50)
  --write               Apply changes to database (Phase 2, default: dry run)`)
  process.exit(1)
}

// ── Load all trail routes from CDN ────────────────────────────────────

async function loadAllTrailRoutes() {
  const geoJSONs = {}
  const names = Object.keys(TRAILS).filter(n => n !== 'test')
  for (const name of names) {
    console.log(`  Loading ${name}.json from CDN...`)
    const res = await fetch(`https://cdn.opentrail.org/${name}.json`)
    if (res.ok) {
      geoJSONs[name] = decodeTrail(await res.json())
    } else {
      console.log(`  ⚠ Failed to load ${name}.json (${res.status})`)
    }
  }
  return geoJSONs
}

// ── Trail chunking ────────────────────────────────────────────────────

function simplifyTrail(coords, step) {
  const result = []
  for (let i = 0; i < coords.length; i += step) result.push(coords[i])
  if (result[result.length - 1] !== coords[coords.length - 1]) {
    result.push(coords[coords.length - 1])
  }
  return result
}

function chunkTrail(simplifiedCoords, chunkMiles) {
  const pointsPerChunk = Math.ceil(chunkMiles * 10)
  const chunks = []
  for (let i = 0; i < simplifiedCoords.length; i += pointsPerChunk) {
    const end = Math.min(i + pointsPerChunk + 1, simplifiedCoords.length)
    chunks.push(simplifiedCoords.slice(i, end))
  }
  return chunks
}

// ── Overpass query builder ────────────────────────────────────────────

const NODE_QUERIES = [
  '"amenity"="drinking_water"',
  '"waterway"="water_point"',
  '"tourism"="camp_site"',
  '"tourism"="wilderness_hut"',
  '"amenity"="shelter"',
  '"information"="guidepost"',
  '"highway"="trail_junction"',
  '"natural"="peak"',
  '"natural"="saddle"',
  '"mountain_pass"="yes"',
  '"tourism"="viewpoint"',
  '"historic"="ruins"',
  '"information"="board"',
  '"information"="office"',
  '"amenity"="ranger_station"',
  '"place"~"city|town|village|hamlet"',
  '"amenity"="pharmacy"',
  '"amenity"="post_office"',
  '"shop"~"convenience|supermarket|outdoor"'
]

const WAY_QUERIES = [
  '"amenity"="drinking_water"',
  '"tourism"="camp_site"',
  '"amenity"="shelter"',
  '"amenity"="drinking_water"'
]

function getChunkBbox(segment, padMiles) {
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity
  for (const [lon, lat] of segment) {
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
    if (lon < minLon) minLon = lon
    if (lon > maxLon) maxLon = lon
  }
  const padDeg = padMiles / 69
  minLat -= padDeg
  maxLat += padDeg
  minLon -= padDeg / Math.cos((minLat + maxLat) / 2 * Math.PI / 180)
  maxLon += padDeg / Math.cos((minLat + maxLat) / 2 * Math.PI / 180)
  return { minLat, maxLat, minLon, maxLon }
}

function buildOverpassQuery(bbox) {
  const b = `${bbox.minLat},${bbox.minLon},${bbox.maxLat},${bbox.maxLon}`
  const nodeLines = NODE_QUERIES.map(q => `  node[${q}](${b});`).join('\n')
  const wayLines = WAY_QUERIES.map(q => `  way[${q}](${b});`).join('\n')
  return `[out:json][timeout:120];\n(\n${nodeLines}\n${wayLines}\n);\nout center body;`
}

// ── Overpass fetch ────────────────────────────────────────────────────

async function fetchOverpass(query, endpoint) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(query)
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Overpass API error ${res.status}: ${text.slice(0, 500)}`)
  }
  const data = await res.json()
  if (data.remark && data.remark.includes('timeout')) {
    throw new Error('Overpass query timed out: ' + data.remark)
  }
  return data
}

async function fetchAllChunks(trailName, geoJSON, opts) {
  const cachePath = resolve(DATA_DIR, `${trailName}-raw.json`)
  if (!opts.noCache && existsSync(cachePath)) {
    console.log(`Using cached Overpass data from ${cachePath}`)
    return JSON.parse(readFileSync(cachePath, 'utf8'))
  }

  const coords = geoJSON.features[0].geometry.coordinates
  const simplified = simplifyTrail(coords, 10)
  const chunks = chunkTrail(simplified, opts.chunk)
  const maxRadius = Math.max(opts.campRadius, opts.poiRadius)
  console.log(`Trail: ${trailName} (${coords.length} points, ${simplified.length} simplified, ${chunks.length} chunks)`)

  const allElements = []
  const seenIds = new Set()

  for (let i = 0; i < chunks.length; i++) {
    const bbox = getChunkBbox(chunks[i], maxRadius)
    const latSpan = bbox.maxLat - bbox.minLat
    const lonSpan = bbox.maxLon - bbox.minLon
    console.log(`  Chunk ${i + 1}/${chunks.length} (${latSpan.toFixed(1)}°×${lonSpan.toFixed(1)}°)...`)

    if (latSpan > 8 || lonSpan > 8) {
      console.log(`  Skipping oversized bbox — reduce --chunk value (currently ${opts.chunk})`)
      continue
    }

    const query = buildOverpassQuery(bbox)

    let result
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        result = await fetchOverpass(query, opts.overpass)
        break
      } catch (e) {
        if (attempt < 2) {
          const wait = 30 * (attempt + 1)
          console.log(`  Attempt ${attempt + 1} failed: ${e.message}. Retrying in ${wait}s...`)
          await new Promise(r => setTimeout(r, wait * 1000))
        } else {
          throw e
        }
      }
    }

    let newCount = 0
    for (const el of (result.elements || [])) {
      const key = `${el.type}_${el.id}`
      if (!seenIds.has(key)) {
        seenIds.add(key)
        allElements.push(el)
        newCount++
      }
    }
    console.log(`    Got ${result.elements?.length || 0} elements (${newCount} new after dedup)`)

    if (i < chunks.length - 1) {
      console.log('    Waiting 5s before next chunk...')
      await new Promise(r => setTimeout(r, 5000))
    }
  }

  const cached = { elements: allElements }
  mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(cachePath, JSON.stringify(cached))
  console.log(`Cached ${allElements.length} elements to ${cachePath}`)
  return cached
}

// ── Post-filter by exact trail distance ───────────────────────────────

function minTrailDistance(el, coords) {
  const lat = el.lat ?? el.center?.lat
  const lng = el.lon ?? el.center?.lon
  if (lat == null || lng == null) return Infinity
  let minDist = Infinity
  for (const c of coords) {
    const d = haversine(c[1], c[0], lat, lng)
    if (d < minDist) minDist = d
  }
  return minDist
}

function filterByTrailDistance(elements, geoJSON, campRadius, poiRadius) {
  const coords = geoJSON.features[0].geometry.coordinates
  return elements.filter(el => {
    const tags = el.tags || {}
    const dist = minTrailDistance(el, coords)
    if (isCamp(tags)) return dist <= campRadius
    return dist <= poiRadius
  })
}

// ── Icon classification ───────────────────────────────────────────────

function isSeasonalWater(tags) {
  const isWater = tags.natural === 'spring' || tags.amenity === 'drinking_water' ||
    tags.waterway === 'water_point'
  return isWater &&
    (tags.seasonal === 'yes' || tags.intermittent === 'yes' ||
      tags['flow:seasonal'] === 'yes' || tags['water:seasonal'] === 'yes')
}

function isReliableWater(tags) {
  const isWater = tags.natural === 'spring' || tags.amenity === 'drinking_water' ||
    tags.waterway === 'water_point'
  return isWater && !isSeasonalWater(tags)
}

function isCamp(tags) {
  return tags.tourism === 'camp_site' || tags.tourism === 'wilderness_hut' ||
    tags.amenity === 'shelter' ||
    ['basic_hut', 'lean_to', 'weather_shelter', 'open_shelter'].includes(tags.shelter_type)
}

function isJunction(tags) {
  return tags.information === 'guidepost' || tags.highway === 'trail_junction'
}

function isTown(tags) {
  return /^(city|town|village|hamlet)$/.test(tags.place) ||
    tags.amenity === 'pharmacy' || tags.amenity === 'post_office' ||
    /^(convenience|supermarket|outdoor)$/.test(tags.shop)
}

function classifyIcons(tags) {
  const earned = new Set()
  if (isSeasonalWater(tags)) earned.add('s')
  if (isReliableWater(tags)) earned.add('w')
  if (isCamp(tags)) earned.add('c')
  if (isJunction(tags)) earned.add('j')
  if (isTown(tags)) earned.add('t')
  if (earned.size === 0) earned.add('o')
  return ICON_ORDER.filter(ic => earned.has(ic)).join('')
}

// ── Title generation ──────────────────────────────────────────────────

const TYPE_LABELS = {
  'amenity=drinking_water': 'Water',
  'waterway=water_point': 'Water Point',
  'tourism=camp_site': 'Campsite',
  'tourism=wilderness_hut': 'Hut',
  'amenity=shelter': 'Shelter',
  'information=guidepost': 'Guidepost',
  'highway=trail_junction': 'Trail Junction',
  'natural=peak': 'Peak',
  'natural=saddle': 'Saddle',
  'mountain_pass=yes': 'Pass',
  'tourism=viewpoint': 'Viewpoint',
  'historic=ruins': 'Ruins',
  'information=board': 'Info Board',
  'information=office': 'Visitor Center',
  'amenity=ranger_station': 'Ranger Station',
  'amenity=pharmacy': 'Pharmacy',
  'amenity=post_office': 'Post Office'
}

function inferTypeLabel(tags) {
  for (const [key, label] of Object.entries(TYPE_LABELS)) {
    const [k, v] = key.split('=')
    if (tags[k] === v) return label
  }
  if (/^(city|town|village|hamlet)$/.test(tags.place)) return 'Town'
  if (/^(convenience|supermarket|outdoor)$/.test(tags.shop)) return 'Store'
  return 'OSM POI'
}

function buildTitle(tags) {
  if (tags.name) return tags.name
  if (tags['name:en']) return tags['name:en']
  const label = inferTypeLabel(tags)
  if (tags.operator) return `${label} (${tags.operator})`
  if (tags.ref) return `${label} ${tags.ref}`
  return label
}

// ── Description generation ────────────────────────────────────────────

function buildDesc(tags) {
  const parts = ['Imported waypoint from OpenStreetMaps.']
  parts.push(`Type: ${inferTypeLabel(tags).toLowerCase()}.`)
  if (tags.seasonal === 'yes' || tags.intermittent === 'yes') parts.push('Seasonal/intermittent.')
  if (tags.operator) parts.push(`Operator: ${tags.operator}.`)
  if (tags.fee === 'yes') parts.push('Fee required.')
  if (tags['capacity:tents']) parts.push(`Tent capacity: ${tags['capacity:tents']}.`)
  if (tags.bear_box === 'yes') parts.push('Bear box available.')
  if (tags.fire_ring === 'yes') parts.push('Fire ring.')
  if (tags.toilets === 'yes') parts.push('Toilets.')
  if (tags.backcountry === 'yes') parts.push('Backcountry.')
  if (tags.access) parts.push(`Access: ${tags.access}.`)
  if (tags.source) parts.push(`Source: ${tags.source}.`)
  if (tags.ref) parts.push(`Ref: ${tags.ref}.`)
  return parts.join(' ')
}

// ── Elevation ─────────────────────────────────────────────────────────

function parseElev(tags) {
  const raw = tags.ele
  if (!raw) return null
  const str = String(raw).trim()
  const ftMatch = str.match(/^([\d.,]+)\s*ft$/i)
  if (ftMatch) return Math.round(parseFloat(ftMatch[1].replace(/,/g, '')))
  const mMatch = str.match(/^([\d.,]+)\s*m?$/)
  if (mMatch) return Math.round(parseFloat(mMatch[1].replace(/,/g, '')) * 3.28084)
  const num = parseFloat(str.replace(/,/g, ''))
  if (isNaN(num)) return null
  return num > 1000 ? Math.round(num * 3.28084) : Math.round(num)
}

async function lookupElevations(candidates, apiKey) {
  const needed = candidates.filter(c => c.elev == null)
  if (needed.length === 0) return
  console.log(`Looking up elevations for ${needed.length} points via Google Maps API...`)

  let apiCalls = 0
  let idx = 0
  while (idx < needed.length) {
    const batch = needed.slice(idx, idx + GOOG_ELEV_BATCH)
    idx += GOOG_ELEV_BATCH
    const locations = batch.map(c => `${c.lat},${c.lng}`).join('|')
    const url = `${GOOG_ELEV_URL}?locations=${encodeURIComponent(locations)}&key=${apiKey}`

    let result
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(url)
      result = await res.json()
      if (result.status === 'OK' || result.status === 'INVALID_REQUEST') break
      if (attempt < 2) await new Promise(r => setTimeout(r, 2000 * (attempt + 1)))
    }

    apiCalls++
    if (result?.status === 'OK' && result.results) {
      for (let j = 0; j < batch.length; j++) {
        if (j < result.results.length) {
          batch[j].elev = Math.round(result.results[j].elevation * 3.28084)
        }
      }
    }

    if (idx < needed.length) await new Promise(r => setTimeout(r, 50))
  }

  console.log(`  Elevation lookup complete (${apiCalls} API calls)`)
}

// ── Process OSM element into candidate marker ─────────────────────────

function processElement(el) {
  const lat = el.lat ?? el.center?.lat
  const lng = el.lon ?? el.center?.lon
  if (lat == null || lng == null) return null

  const tags = el.tags || {}
  if (Object.keys(tags).length === 0) return null

  if (tags.natural === 'peak' && !tags.name && !tags['name:en']) return null

  if (tags.natural === 'spring' && !tags.name && !tags['name:en'] &&
    !isCamp(tags) && !isJunction(tags) && !isTown(tags) &&
    tags.amenity !== 'drinking_water' && tags.waterway !== 'water_point') {
    return null
  }

  return {
    lat,
    lng,
    elev: parseElev(tags),
    title: buildTitle(tags),
    desc: buildDesc(tags),
    icons: classifyIcons(tags),
    osmType: el.type,
    osmId: el.id,
    osmTags: tags
  }
}

// ── Trail relations (mileage on all nearby trails) ────────────────────

function buildTrailRelations(lat, lng, allGeoJSONs) {
  const create = []
  for (const trailName in TRAILS) {
    if (!allGeoJSONs[trailName]) continue
    const min = searchTrailRoute(lng, lat, allGeoJSONs[trailName], 50)
    if (min.index > -1) {
      create.push({
        milex10: min.index,
        trail: { connect: { name: trailName } }
      })
    }
  }
  return { create }
}

// ── DB conflict detection ─────────────────────────────────────────────

function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6378137
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

async function findConflicts(candidates, overlapMeters) {
  const allMarkers = await prisma.marker.findMany({
    include: { trails: { select: { trailId: true, milex10: true } } }
  })
  console.log(`Loaded ${allMarkers.length} existing markers from DB`)

  const conflicts = []
  const newMarkers = []

  for (const c of candidates) {
    let closest = null
    let closestDist = Infinity
    for (const m of allMarkers) {
      const d = distanceMeters(c.lat, c.lng, m.lat, m.lng)
      if (d < closestDist) {
        closestDist = d
        closest = m
      }
    }

    if (closest && closestDist <= overlapMeters) {
      conflicts.push({
        id: conflicts.length,
        osm: {
          title: c.title,
          lat: c.lat,
          lng: c.lng,
          elev: c.elev,
          icons: c.icons,
          desc: c.desc,
          osmType: c.osmType,
          osmId: c.osmId,
          osmTags: c.osmTags
        },
        existing: {
          dbid: closest.id,
          title: closest.title,
          lat: closest.lat,
          lng: closest.lng,
          elev: closest.elev,
          icons: closest.icons,
          desc: closest.desc
        },
        distance_m: Math.round(closestDist * 10) / 10,
        decision: null
      })
    } else {
      newMarkers.push(c)
    }
  }

  return { conflicts, newMarkers }
}

// ── Phase 1: Fetch & Classify ─────────────────────────────────────────

async function phase1(opts) {
  const { trail: trailName } = opts
  if (!TRAILS[trailName]) {
    console.error(`Unknown trail: ${trailName}. Valid: ${Object.keys(TRAILS).join(', ')}`)
    process.exit(1)
  }

  console.log(`\n=== Phase 1: Fetch & Classify for ${trailName} ===\n`)

  const trail = await prisma.trail.findUnique({ where: { name: trailName } })
  if (!trail) {
    console.error(`Trail "${trailName}" not found in database`)
    process.exit(1)
  }

  console.log('Loading trail route from CDN...')
  const res = await fetch(`https://cdn.opentrail.org/${trailName}.json`)
  if (!res.ok) throw new Error(`Failed to fetch ${trailName}.json: ${res.status}`)
  const geoJSON = decodeTrail(await res.json())
  const coordCount = geoJSON.features[0].geometry.coordinates.length
  console.log(`Route: ${coordCount} points (~${(coordCount / 10).toFixed(0)} miles)`)

  const overpassData = await fetchAllChunks(trailName, geoJSON, opts)
  const rawElements = overpassData.elements || []
  console.log(`\nTotal OSM elements: ${rawElements.length}`)

  const filtered = filterByTrailDistance(rawElements, geoJSON, opts.campRadius, opts.poiRadius)
  console.log(`Within ${opts.poiRadius}mi (${opts.campRadius}mi for camps) of trail: ${filtered.length}`)

  const candidates = []
  for (const el of filtered) {
    const c = processElement(el)
    if (c) candidates.push(c)
  }
  console.log(`Valid candidates after processing: ${candidates.length}`)

  console.log('\nIcon distribution:')
  const iconCounts = {}
  for (const c of candidates) {
    const primary = c.icons.charAt(0)
    iconCounts[primary] = (iconCounts[primary] || 0) + 1
  }
  for (const ic of ICON_ORDER) {
    console.log(`  ${ic}: ${iconCounts[ic] || 0}`)
  }

  if (process.env.GOOGLE_MAPS_API_KEY) {
    await lookupElevations(candidates, process.env.GOOGLE_MAPS_API_KEY)
  } else {
    console.log('\nNo GOOGLE_MAPS_API_KEY set — missing elevations will be set to 0')
  }

  for (const c of candidates) {
    if (c.elev == null) c.elev = 0
    if (c.elev > 32767) c.elev = 32767
    if (c.elev < -32768) c.elev = -32768
  }

  console.log('\nChecking for conflicts with existing DB markers...')
  const { conflicts, newMarkers } = await findConflicts(candidates, opts.overlap)

  mkdirSync(DATA_DIR, { recursive: true })
  const newPath = resolve(DATA_DIR, `${trailName}-new.json`)
  const conflictPath = resolve(DATA_DIR, `${trailName}-conflicts.json`)

  writeFileSync(newPath, JSON.stringify(newMarkers, null, 2))
  console.log(`\nNew markers (no conflict): ${newMarkers.length} → ${newPath}`)

  const conflictFile = {
    trail: trailName,
    generated: new Date().toISOString(),
    overlap_meters: opts.overlap,
    conflicts
  }
  writeFileSync(conflictPath, JSON.stringify(conflictFile, null, 2))
  console.log(`Conflicts: ${conflicts.length} → ${conflictPath}`)

  console.log(`\nNext steps:`)
  console.log(`  1. Edit ${conflictPath} to set decisions (skip/merge/new/replace)`)
  console.log(`  2. Run: node scripts/import-osm.js ${trailName} --apply [--write]`)
}

// ── Phase 2: Apply Decisions ──────────────────────────────────────────

function mergeIcons(existing, osmIcons) {
  const set = new Set(existing.split(''))
  for (const ch of osmIcons) set.add(ch)
  return ICON_ORDER.filter(ic => set.has(ic)).join('')
}

async function phase2(opts) {
  const { trail: trailName, write: doWrite } = opts
  if (!TRAILS[trailName]) {
    console.error(`Unknown trail: ${trailName}`)
    process.exit(1)
  }

  console.log(`\n=== Phase 2: Apply Decisions for ${trailName} ===\n`)
  console.log(doWrite ? 'WRITE MODE — changes will be committed' : 'DRY RUN — no changes will be made')

  const trail = await prisma.trail.findUnique({ where: { name: trailName } })
  if (!trail) {
    console.error(`Trail "${trailName}" not found in database`)
    process.exit(1)
  }

  console.log('Loading trail routes from CDN...')
  const allGeoJSONs = await loadAllTrailRoutes()

  const newPath = resolve(DATA_DIR, `${trailName}-new.json`)
  const conflictPath = resolve(DATA_DIR, `${trailName}-conflicts.json`)

  if (!existsSync(newPath)) {
    console.error(`No new markers file found: ${newPath}`)
    console.error('Run Phase 1 first: node scripts/import-osm.js ' + trailName)
    process.exit(1)
  }

  const newMarkers = JSON.parse(readFileSync(newPath, 'utf8'))
  console.log(`New markers to insert: ${newMarkers.length}`)

  let conflictData = null
  if (existsSync(conflictPath)) {
    conflictData = JSON.parse(readFileSync(conflictPath, 'utf8'))
    console.log(`Conflicts to process: ${conflictData.conflicts.length}`)
  const undecided = conflictData.conflicts.filter(c => !c.decision)
  if (undecided.length > 0 && opts.resolve) {
    const valid = ['skip', 'merge', 'new', 'replace']
    if (!valid.includes(opts.resolve)) {
      console.error(`Invalid --resolve value: ${opts.resolve}. Must be one of: ${valid.join('/')}`)
      process.exit(1)
    }
    for (const c of conflictData.conflicts) {
      if (!c.decision) c.decision = opts.resolve
    }
    console.log(`Auto-resolved ${undecided.length} undecided conflicts as '${opts.resolve}'`)
  } else if (undecided.length > 0) {
    console.log(`  ⚠ ${undecided.length} conflicts have no decision set (use --resolve <skip|merge|new|replace> to auto-resolve)`)
  }
  }

  // Insert new markers
  let inserted = 0
  for (const c of newMarkers) {
    if (doWrite) {
      const trailRelations = buildTrailRelations(c.lat, c.lng, allGeoJSONs)
      await prisma.marker.create({
        data: {
          lat: c.lat,
          lng: c.lng,
          elev: c.elev,
          title: c.title,
          desc: c.desc,
          icons: c.icons,
          images: [],
          trails: trailRelations
        }
      })
    }
    inserted++
  }
  console.log(`\nNew markers: ${inserted} ${doWrite ? 'inserted' : 'would be inserted'}`)

  // Process conflict decisions
  const counts = { skip: 0, merge: 0, new: 0, replace: 0, undecided: 0 }
  if (conflictData) {
    for (const conflict of conflictData.conflicts) {
      const d = conflict.decision
      if (!d) { counts.undecided++; continue }

      const osm = conflict.osm

      if (d === 'skip') {
        counts.skip++
        console.log(`  [skip] ${osm.title}`)
      } else if (d === 'merge') {
        counts.merge++
        console.log(`  [merge] ${osm.title} → existing #${conflict.existing.dbid}`)
        if (doWrite) {
          const existing = await prisma.marker.findUnique({ where: { id: conflict.existing.dbid } })
          if (existing) {
            const mergedDesc = existing.desc + '\n\n' + osm.desc
            const mergedIcons = mergeIcons(existing.icons, osm.icons)
            await prisma.marker.update({
              where: { id: existing.id },
              data: { desc: mergedDesc, icons: mergedIcons }
            })
          }
        }
      } else if (d === 'new') {
        counts.new++
        console.log(`  [new] ${osm.title}`)
        if (doWrite) {
          const trailRelations = buildTrailRelations(osm.lat, osm.lng, allGeoJSONs)
          await prisma.marker.create({
            data: {
              lat: osm.lat,
              lng: osm.lng,
              elev: osm.elev || 0,
              title: osm.title,
              desc: osm.desc,
              icons: osm.icons,
              images: [],
              trails: trailRelations
            }
          })
        }
      } else if (d === 'replace') {
        counts.replace++
        console.log(`  [replace] ${osm.title} ← replacing #${conflict.existing.dbid}`)
        if (doWrite) {
          const existingId = conflict.existing.dbid
          // Delete old marker (cascading deletes handle related records)
          await prisma.marker.delete({ where: { id: existingId } })
          // Create replacement
          const trailRelations = buildTrailRelations(osm.lat, osm.lng, allGeoJSONs)
          await prisma.marker.create({
            data: {
              lat: osm.lat,
              lng: osm.lng,
              elev: osm.elev || 0,
              title: osm.title,
              desc: osm.desc,
              icons: osm.icons,
              images: [],
              trails: trailRelations
            }
          })
        }
      }
    }
  }

  console.log(`\nConflict decisions:`)
  console.log(`  Skip: ${counts.skip}`)
  console.log(`  Merge: ${counts.merge}`)
  console.log(`  New: ${counts.new}`)
  console.log(`  Replace: ${counts.replace}`)
  console.log(`  Undecided: ${counts.undecided}`)

  const totalInserted = inserted + counts.new + counts.replace
  console.log(`\nTotal markers ${doWrite ? 'created' : 'to create'}: ${totalInserted}`)
  console.log(`Total markers ${doWrite ? 'updated' : 'to update'}: ${counts.merge}`)

  if (!doWrite && (totalInserted > 0 || counts.merge > 0)) {
    console.log('\nRun with --write to apply changes.')
  }
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs()
  if (!opts.trail) usage()

  if (opts.apply) {
    await phase2(opts)
  } else {
    await phase1(opts)
  }
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
