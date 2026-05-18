import { env } from '$env/dynamic/private'
import { prisma } from '$lib/prisma.ts'
import { json } from '@sveltejs/kit'
import * as Sentry from '@sentry/sveltekit';
import { dev } from '$app/environment';
import { purgeGetDataCache } from '$lib/server/cloudflare-purge.js';

function getAuthToken(request) {
    const auth = request.headers.get('authorization')
    if (!auth) return null
    return auth.replace('Bearer ', '')
}

export async function GET({ request }) {
    try {
        if (getAuthToken(request) !== env.MOD_KEY) {
            return new Response(null, { status: 403 })
        }
        const comments = await prisma.comment.findMany({
            take: 100,
            orderBy: { date: 'desc' },
            include: {
                marker: {
                    select: {
                        id: true,
                        title: true,
                        trails: { select: { trail: { select: { name: true } } } }
                    }
                }
            }
        })
        return json(comments)
} catch (e) {
    if (!dev) Sentry.captureException(e);
    console.log(e)
    return new Response(null, { status: 400 })
  }
}

export async function DELETE({ request, url }) {
  try {
    if (getAuthToken(request) !== env.MOD_KEY) {
      return new Response(null, { status: 403 })
    }
    const id = parseInt(url.searchParams.get('id'))
    if (!id) return new Response(null, { status: 400 })
    const comment = await prisma.comment.findUnique({
      where: { id },
      select: { marker: { select: { trails: { select: { trail: { select: { name: true } } } } } } }
    });
    const trailNames = comment ? comment.marker.trails.map(t => t.trail.name) : [];
    await prisma.comment.delete({ where: { id } })
    if (trailNames.length > 0) purgeGetDataCache(trailNames);
    return new Response()
  } catch (e) {
    if (!dev) Sentry.captureException(e);
    console.log(e)
    return new Response(null, { status: 400 })
  }
}
