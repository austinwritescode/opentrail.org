import { PrismaClient } from '$lib/prisma.ts'
import { json } from '@sveltejs/kit'
const prisma = new PrismaClient()

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
                }
            },
            include: {
                trails: {
                    select: {
                        milex10: true
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
                m.comments[j].date = m.comments[j].date.toLocaleDateString("en-US", { timeZone: 'UTC' })
            }
            features[i] = {
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [m.lng, m.lat]
                },
                properties: {
                    title: m.title,
                    mile: (m.trails[0].milex10 / 10).toFixed(1), //flatten + handle db storage optimization
                    elev: m.elev,
                    images: m.images,
                    desc: m.desc,
                    comments: m.comments,
                    icon: m.icons.charAt(0), //kind of dumb but map needs it this way
                    icons: m.icons,
                    dbid: m.id //ref this for writing to db
                },
                id: i
            }
        }

        // console.log(features)
        return json({
            'type': 'FeatureCollection',
            'features': features
        })
    } catch (e) {
        console.log(e)
        return new Response(e.message, { status: 400 })
    }
}