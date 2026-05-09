import { prisma } from '$lib/prisma.ts'
import { json } from '@sveltejs/kit'
import * as Sentry from '@sentry/sveltekit';
import { dev } from '$app/environment';

//(used for offline image fetching)
export async function GET({ url }) {
    try {
        const trail = url.searchParams.get('trail')

        const markers = await prisma.marker.findMany({
            where: {
                trails: {
                    some: {
                        trail: {
                            name: trail
                        }
                    }
                },
                images: {
                    isEmpty: false
                }
            },
            select: {
                images: true
            }
        })

        return json(markers.flatMap((el) => (el.images)))
} catch (e) {
    if (!dev) Sentry.captureException(e);
    console.log(e)
    return new Response(e.message, { status: 400 })
    }
}