import { PrismaClient } from '$lib/prisma.ts'
const prisma = new PrismaClient()

export async function POST({ request, url }) {
    try {
        const req = await request.json()
        const type = url.searchParams.get('type')
        let ip = request.headers.get("x-forwarded-for") || ''
        if (ip !== '') ip = ip.split(',').slice(0, -1).join(',')
        console.log(`received flagged item from ip [${ip}] / user [${req.user}]`)
        if (type === 'flagImage') {
            await prisma.flaggedImage.create({
                data: {
                    marker: {
                        connect: {
                            id: req.markerId
                        }
                    },
                    image: req.image,
                    reason: req.reason,
                    user: req.user,
                    date: new Date(),
                    ip: ip
                }
            })
        }
        else if (type === 'flagComment') {
            const commentId = await prisma.comment.findFirst({
                where: {
                    markerId: req.markerId,
                    text: req.text,
                },
                select: { id: true }
            })
            await prisma.comment.update({
                where: commentId,
                data: {
                    flags: {
                        create: {
                            reason: req.reason,
                            user: req.user,
                            date: new Date(),
                            ip: ip
                        }
                    }
                }
            })
        }
        else if (type === 'flagMarker') {
            await prisma.flaggedMarker.create({
                data: {
                    marker: {
                        connect: {
                            id: req.markerId
                        }
                    },
                    reason: req.reason,
                    user: req.user,
                    date: new Date(),
                    ip: ip
                }
            })
        }
        return new Response();
    } catch (e) {
        console.log(e)
        return new Response(e.message, { status: 400 })
    }
}
