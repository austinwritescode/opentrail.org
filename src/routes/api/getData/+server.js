import { prisma } from '$lib/prisma.ts'
import { json } from '@sveltejs/kit'
import * as Sentry from '@sentry/sveltekit';
import { dev } from '$app/environment';
import { createHash } from 'crypto';

export async function GET({ request, url }) {
  try {
    const trail = url.searchParams.get('trail')

    const ifNoneMatch = request.headers.get('if-none-match')

    const markers = await prisma.marker.findMany({
      where: {
        trails: {
          some: {
            trail: {
              name: trail
            }
          }
        }
      },
      include: {
        trails: {
          select: {
            milex10: true,
          },
          where: {
            trail: {
              is: {
                name: trail
              }
            }
          }
        },
        comments: {
          select: {
            text: true,
            user: true,
            date: true
          },
          orderBy: {
            date: 'desc'
          }
        }
      }
    })

    markers.sort((a, b) => { return a.trails[0].milex10 - b.trails[0].milex10 })

    const features = new Array(markers.length)
    for (let i = 0; i < markers.length; i++) {
      const m = markers[i]
      for (let j = 0; j < m.comments.length; j++) {
        m.comments[j].date = m.comments[j].date.toLocaleDateString("en-US")
      }
      features[i] = {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [m.lng, m.lat]
        },
        properties: {
          title: m.title,
          mile: (m.trails[0].milex10 / 10).toFixed(1),
          elev: m.elev,
          images: m.images,
          desc: m.desc,
          comments: m.comments,
          commentCount: m.comments.length,
          icon: m.icons.charAt(0),
          icons: m.icons,
          dbid: m.id
        },
        id: i
      }
    }

    const body = JSON.stringify({
      'type': 'FeatureCollection',
      'features': features
    })

    const etag = '"' + createHash('sha256').update(body).digest('hex').slice(0, 16) + '"'

	if (ifNoneMatch === etag) {
		return new Response(null, {
			status: 304,
			headers: {
				'ETag': etag
			}
		})
	}

	return new Response(body, {
		headers: {
			'Content-Type': 'application/json',
			'ETag': etag
		}
	})
  } catch (e) {
    if (!dev) Sentry.captureException(e);
    console.log(e)
    return new Response(e.message, { status: 400 })
  }
}