import { PrismaClient } from '$lib/prisma.ts'
const prisma = new PrismaClient()

export async function POST({ request }) {
    try {
        const req = await request.json()
        let ip = request.headers.get("x-forwarded-for") || ''
        if (ip !== '') ip = ip.split(',').slice(0, -1).join(',')
        console.log(`received comment from ip [${ip}] / user [${req.user}]`)
        await prisma.comment.create({
            data: {
                ...req,
                ip: {
                    create: {
                        date: new Date(),
                        ip: ip,
                    }
                }
            }
        })
        return new Response();
    } catch (e) {
        console.log(e)
        return new Response(e.message, { status: 400 })
    }
}