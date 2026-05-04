#!/usr/bin/env node
import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { decodeTrail } from '../src/lib/decode-trail.js'

if (!process.env.DATABASE_URL) {
  try {
    for (const line of readFileSync(resolve('.env'), 'utf8').split('\n')) {
      if (line.startsWith('#') || !line.includes('=')) continue
      const [key, ...rest] = line.split('=')
      if (key.trim() === 'DATABASE_URL') {
        process.env.DATABASE_URL = rest.join('=').trim().replace(/^["']|["']$/g, '')
        break
      }
    }
  } catch {}
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not found in environment or .env file')
    process.exit(1)
  }
}

const prisma = new PrismaClient()

function haversine(lat1, lon1, lat2, lon2) {
  const R = 3958.8
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
    * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function nearestPoint(lat, lng, geojson) {
  const coords = geojson.features[0].geometry.coordinates
  let best = { dist: Infinity, index: -1 }
  for (let i = 0; i < coords.length; i++) {
    const d = haversine(coords[i][1], coords[i][0], lat, lng)
    if (d < best.dist) best = { dist: d, index: i }
  }
  return best
}

async function main() {
  const args = process.argv.slice(2)
  const write = args.includes('--write')
  const cdn = args.includes('--cdn')
  const positional = args.filter(a => !a.startsWith('--'))
  const trailName = positional[0]
  const filePath = positional[1]

  if (!trailName || (!cdn && !filePath)) {
    console.log('Usage: node scripts/recalc-mileage.js <trail> <geojson-file> [--write]')
    console.log('       node scripts/recalc-mileage.js <trail> --cdn [--write]')
    console.log()
    console.log('  trail        Trail name (PCT, AT, CDT, test)')
    console.log('  geojson-file Path to new trail GeoJSON file')
    console.log('  --cdn        Fetch GeoJSON from cdn.opentrail.org')
    console.log('  --write      Apply changes to database (default: dry run)')
    process.exit(1)
  }

  const trail = await prisma.trail.findUnique({ where: { name: trailName } })
  if (!trail) {
    console.error(`Trail "${trailName}" not found in database`)
    process.exit(1)
  }

  let geojson
  if (cdn) {
    console.log(`Fetching ${trailName}.json from CDN...`)
    const res = await fetch(`https://cdn.opentrail.org/${trailName}.json`)
    if (!res.ok) {
      console.error(`Failed to fetch from CDN: ${res.status}`)
      process.exit(1)
    }
    geojson = decodeTrail(await res.json())
  } else {
    geojson = decodeTrail(JSON.parse(readFileSync(resolve(filePath), 'utf8')))
  }

  const coords = geojson.features[0].geometry.coordinates
  console.log(`Trail: ${trailName} (${coords.length} points, ${(coords.length / 10).toFixed(1)} miles)`)

  const markersOnTrail = await prisma.markersOnTrails.findMany({
    where: { trailId: trail.id },
    include: { marker: true }
  })
  console.log(`Found ${markersOnTrail.length} markers on ${trailName}\n`)

  let updated = 0
  let unchanged = 0

  for (const mot of markersOnTrail) {
    const { lat, lng, id, title } = mot.marker
    const nearest = nearestPoint(lat, lng, geojson)
    const oldMile = mot.milex10 != null ? (mot.milex10 / 10).toFixed(1) : null
    const newMile = (nearest.index / 10).toFixed(1)

    if (mot.milex10 === nearest.index) {
      unchanged++
      continue
    }

    updated++
    const arrow = oldMile == null ? '  +' : ' →'
    const oldStr = oldMile ?? '—'
    const delta = mot.milex10 != null ? ` (Δ${((nearest.index - mot.milex10) / 10).toFixed(1)}mi)` : ''
    console.log(`  [${id}] ${title}: ${oldStr}${arrow} ${newMile}${delta}`)

    if (nearest.dist > 2) {
      console.log(`       ⚠ ${nearest.dist.toFixed(1)}mi from trail — verify this marker`)
    }

    if (write) {
      await prisma.markersOnTrails.update({
        where: { markerId_trailId: { markerId: id, trailId: trail.id } },
        data: { milex10: nearest.index }
      })
    }
  }

  console.log(`\n${updated} changed, ${unchanged} unchanged`)
  if (write) console.log('Database updated.')
  else if (updated > 0) console.log('Run with --write to apply changes.')
  else console.log('No changes needed.')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
