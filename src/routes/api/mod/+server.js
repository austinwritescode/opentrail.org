import { env } from '$env/dynamic/private'
import { PrismaClient } from '$lib/prisma.ts'
const prisma = new PrismaClient()
import { json } from '@sveltejs/kit'

export async function GET({ request, url }) {
    try {
        if (url.searchParams.get('key') === env.MOD_KEY) {
            let ip = request.headers.get("x-forwarded-for") || ''
            if (ip !== '') ip = ip.split(',').slice(0, -1).join(',')
            console.log(`successful moderation login from ip [${ip}]`)
            let mod = await prisma.moderation.findMany({})
            let markers = {}
            for (let i = 0; i < mod.length; i++) {
                if (mod[i].image) mod[i].image = mod[i].image.toString('base64')
                const dbid = mod[i].request.dbid
                if (dbid && !(dbid in markers)) {
                    const marker = await prisma.marker.findUnique({
                        where: { id: parseInt(dbid) },
                        include: { trails: { select: { trail: { select: { name: true } } } } }
                    })
                    markers[dbid] = marker
                }
            }
            let flaggedImages = await prisma.flaggedImage.findMany({})
            flaggedImages = flaggedImages.map((item) => { return { ...item, type: 'image' } })
            let flaggedComments = await prisma.flaggedComment.findMany({ include: { comment: true } })
            flaggedComments = flaggedComments.map((item) => { return { ...item, type: 'comment' } })
            let flaggedMarkers = await prisma.flaggedMarker.findMany({ include: { marker: true } })
            flaggedMarkers = flaggedMarkers.map((item) => { return { ...item, type: 'marker' } })
            return json({ mod: mod, markers: markers, flags: [...flaggedMarkers, ...flaggedComments, ...flaggedImages] })
        }
        else {
            let ip = request.headers.get("x-forwarded-for") || ''
            if (ip !== '') ip = ip.split(',').slice(0, -1).join(',')
            console.log(`failed moderator login from ip [${ip}]`)
            return new Response(null, { status: 403 })
        }
    } catch (e) {
        console.log(e)
        return new Response(null, { status: 400 })
    }
}

export async function DELETE({ request, url }) {
    try {
        if (url.searchParams.get('key') === env.MOD_KEY) {
            const req = await request.json()
            console.log(`moderator cleared ${req} from moderation queue`)
            await prisma.moderation.delete({
                where: { id: req }
            })
            return new Response()
        }
        else {
            let ip = request.headers.get("x-forwarded-for") || ''
            if (ip !== '') ip = ip.split(',').slice(0, -1).join(',')
            console.log('Failed log-in from ip ' + ip)
            return new Response(null, { status: 403 })
        }
    } catch (e) {
        console.log(e)
        return new Response(null, { status: 400 })
    }
}