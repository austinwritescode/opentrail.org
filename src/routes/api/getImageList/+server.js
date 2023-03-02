import { PrismaClient } from '$lib/prisma.ts'
import { json } from '@sveltejs/kit'
const prisma = new PrismaClient()

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
        console.log(e)
        return new Response(e.message, { status: 400 })
    }
}