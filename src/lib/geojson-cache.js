import fetch from 'node-fetch'
import { TRAILS } from '$lib/store.js'

export let geoJSON = {}
let initPromise = null

async function initialize() {
    const fetches = Object.keys(TRAILS).map(async (trail) => {
        console.log(`loading ${trail}.json`)
        const res = await fetch(`https://cdn.opentrail.org/${trail}.json`)
        if (!res.ok) throw new Error(`Failed to fetch ${trail}.json: ${res.status}`)
        const data = await res.json()
        geoJSON[trail] = data
    })
    await Promise.all(fetches)
    console.log('Loaded geoJSONs to memory')
}

export function initGeoJSON() {
    if (!initPromise) {
        initPromise = initialize().catch(e => { initPromise = null; throw e })
    }
    return initPromise
}
