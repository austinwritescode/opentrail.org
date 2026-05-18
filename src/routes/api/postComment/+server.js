import { prisma } from '$lib/prisma.ts'
import * as Sentry from '@sentry/sveltekit';
import { dev } from '$app/environment';
import { purgeGetDataCache } from '$lib/server/cloudflare-purge.js';

export async function POST({ request, getClientAddress }) {
  try {
    const { text, user, markerId } = await request.json()
    const ip = getClientAddress()
    console.log(`received comment from ip [${ip}] / user [${user}]`)
    await prisma.comment.create({
      data: {
        text,
        user,
        markerId,
        date: new Date(),
        ip: {
          create: {
            date: new Date(),
            ip: ip,
          }
        }
      }
    })
    const marker = await prisma.marker.findUnique({
      where: { id: markerId },
      select: { trails: { select: { trail: { select: { name: true } } } } }
    });
    if (marker) {
      const trailNames = marker.trails.map(t => t.trail.name);
      purgeGetDataCache(trailNames);
    }
    return new Response();
  } catch (e) {
    if (!dev) Sentry.captureException(e);
    console.log(e)
    return new Response(e.message, { status: 400 })
  }
}