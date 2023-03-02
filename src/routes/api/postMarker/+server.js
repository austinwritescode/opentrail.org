import { PrismaClient } from '$lib/prisma.ts'
const prisma = new PrismaClient()
import fetch from 'node-fetch';
import { TRAILS } from '$lib/store.js'
import { searchTrailRoute } from '$lib/helpers.js'
import { env } from '$env/dynamic/private'

let geoJSON = {}
let initialized = false

async function initialize() {
    const fetches = Object.keys(TRAILS).map(async (trail) => {
        console.log(`loading ${trail}.json`)
        const res = await fetch(`https://cdn.opentrail.org/${trail}.json`)
        const data = await res.json()
        geoJSON[trail] = data
    })
    await Promise.all(fetches)
    console.log('Loaded geoJSONs to memory')
    initialized = true
}

export async function POST({ request, url }) {
    if (!initialized) await initialize()
    try {
        const key = url.searchParams.get('key')
        const req = await request.json()
        const type = url.searchParams.get('type')
        if (!key) {
            if (type === 'editLoc' || type === 'newMarker') {
                const nearest = nearestPointPerTrail(req.lat, req.lng)
                if (!(req.trail in nearest)) throw new Error('Marker too far from current trail. Must be within 50 miles.')
            }
            let ip = request.headers.get("x-forwarded-for") || ''
            if (ip !== '') ip = ip.split(',').slice(0, -1).join(',')
            console.log(`received new/edit marker from ip [${ip}] / user [${req.user}]`)
            await prisma.moderation.create({
                data: {
                    date: new Date(),
                    request: req,
                    route: `${url.pathname}?${url.searchParams}`,
                    ip: ip
                }
            })
            return new Response()
        }
        else if (key !== env.MOD_KEY) {
            console.log(`failed moderator login from ip [${ip}]`)
            return new Response(null, { status: 403 })
        }
        else {
            if (type === 'editTitle') {
                await prisma.marker.update({
                    where: {
                        id: req.dbid
                    },
                    data: {
                        title: req.payload
                    }
                })
            }
            if (type === 'editDesc') {
                await prisma.marker.update({
                    where: {
                        id: req.dbid
                    },
                    data: {
                        desc: req.payload
                    }
                })
            }
            if (type === 'editLoc') {
                const elev = await getElev(req.lat, req.lng)
                const trailRelations = createTrailRelations(req.lat, req.lng, req.trail)
                //strategy: delete trail relations before recreating w new mileage
                await prisma.$transaction([
                    prisma.marker.update({
                        where: {
                            id: req.dbid
                        },
                        data: {
                            trails: { deleteMany: {} }
                        }
                    }),
                    prisma.marker.update({
                        where: {
                            id: req.dbid
                        },
                        data: {
                            lat: req.lat,
                            lng: req.lng,
                            elev: elev,
                            trails: trailRelations
                        }
                    })
                ])
            }
            if (type === 'editIcons') {
                await prisma.marker.update({
                    where: {
                        id: req.dbid
                    },
                    data: {
                        icons: req.payload
                    }
                })
            }
            if (type === 'newMarker') {
                const elev = await getElev(req.lat, req.lng)
                const trailRelations = createTrailRelations(req.lat, req.lng, req.trail)
                await prisma.marker.create({
                    data: {
                        lat: req.lat,
                        lng: req.lng,
                        title: req.title,
                        desc: req.desc,
                        icons: req.icons,
                        elev: elev,
                        trails: trailRelations
                    }
                })
            }
            return new Response();
        }
    } catch (e) {
        console.log(e)
        return new Response(e.message, { status: 400 })
    }
}

async function getElev(lat, lng) {
    const res = await fetch(`https://maps.googleapis.com/maps/api/elevation/json?locations=${lat}%2C${lng}&key=${env.GOOGLE_MAPS_API_KEY}`);
    const data = await res.json();
    if (data.status === 'OK') return Math.round(data.results[0].elevation * 3.28084) // meter to feet conversion
    else { console.log('Error fetching elevation:'); console.log(data); return 0 }
}

// Generate the createMany for a prisma query to populate the join table
function createTrailRelations(lat, lng, trail) {
    const nearest = nearestPointPerTrail(lat, lng)
    if (!(trail in nearest)) throw new Error('Marker too far from current trail. Must be within 50 miles.')
    let toReturn = { create: [] }
    //trail associations for nearby trails:
    for (const nearestTrail in nearest) {
        toReturn.create.push({
            milex10: nearest[trail].index,
            trail: { connect: { name: nearestTrail } }
        })
    }
    return toReturn
}

// Checks all trails for nearest tenth of a mile point but only if it's within 50 miles
function nearestPointPerTrail(lat, lng) {
    let toReturn = {}
    for (const trail in TRAILS) {
        const min = searchTrailRoute(lng, lat, geoJSON[trail], 50)
        // console.log(`trail: ${trail} min: ${min.dist} index: ${min.index}`)
        if (min.index > -1) toReturn[trail] = min
    }
    return toReturn
}