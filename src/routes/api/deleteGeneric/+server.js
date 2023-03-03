import { PrismaClient } from '$lib/prisma.ts'
const prisma = new PrismaClient()
import { env } from '$env/dynamic/private'
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
const s3 = new S3Client({
    region: 'auto',
    endpoint: env.S3_ENDPOINT,
    credentials: {
        accessKeyId: env.S3_ACCESS_ID,
        secretAccessKey: env.S3_SECRET_KEY,
    }
})

export async function DELETE({ request, url }) {
    try {
        const type = url.searchParams.get('type')
        const id = parseInt(url.searchParams.get('id'))
        const ignore = url.searchParams.get('ignore')
        const key = url.searchParams.get('key')
        let ip = request.headers.get("x-forwarded-for") || ''
        if (ip !== '') ip = ip.split(',').slice(0, -1).join(',')
        if (key !== env.MOD_KEY) {
            console.log(`failed moderator login from ip [${ip}]`)
            return new Response(null, { status: 403 })
        }

        console.log(`received moderation deletion from ip [${ip}]`)

        if (ignore) clearFlag(id, type)
        else if (type === 'marker') {
            const flag = await prisma.flaggedMarker.findUnique({
                where: { id: id },
                select: {
                    markerId: true,
                    marker: {
                        select: {
                            images: true
                        }
                    }
                }
            })
            flag.marker.images.forEach(async (image) => {
                await deleteImage(image)
            })
            await prisma.marker.delete({ where: { id: parseInt(flag.markerId) } })
        }
        else if (type === 'image') {
            const flag = await prisma.flaggedImage.findUnique({
                where: { id: id },
                select: {
                    image: true,
                    markerId: true,
                    marker: { select: { images: true } }
                }
            })
            await deleteImage(flag.image)
            const newImages = flag.marker.images.filter((image) => image !== flag.image)
            await prisma.marker.update({
                where: { id: parseInt(flag.markerId) },
                data: { images: newImages }
            })
            await prisma.flaggedImage.deleteMany({ where: { image: flag.image } })
        }
        else if (type === 'comment') {
            const flag = await prisma.flaggedComment.findUnique({ where: { id: id }, select: { commentId: true } })
            await prisma.comment.delete({ where: { id: flag.commentId } })
        }
        else if (type === 'clearTestTrail') {
            console.log('Clearing test trail')
            const markers = await prisma.marker.findMany({
                where: {
                    trails: {
                        every: {
                            trail: {
                                name: 'test'
                            }
                        }
                    }
                },
                select: {
                    images: true
                }
            })
            console.log(markers)
            markers.forEach(async (marker) => {
                await marker.images.forEach(async (image) => {
                    await deleteImage(image)
                })
            })
            await prisma.marker.deleteMany({
                where: {
                    trails: {
                        every: {
                            trail: {
                                name: 'test'
                            }
                        }
                    }
                }
            })
        }
        else throw new Error('Bad request...')
        return new Response();
    } catch (e) {
        console.log(e)
        return new Response(e.message, { status: 400 })
    }
}

async function clearFlag(id, type) {
    if (type === 'marker') {
        await prisma.flaggedMarker.delete({ where: { id: id } })
    }
    else if (type === 'image') {
        await prisma.flaggedImage.delete({ where: { id: id } })
    }
    else if (type === 'comment') {
        await prisma.flaggedComment.delete({ where: { id: id } })
    }
}

async function deleteImage(image) {
    console.log(`deleting image ${image} from object storage`)
    const res = await s3.send(new DeleteObjectCommand({
        Bucket: 'opentrail-static',
        Key: `img/${image}.jpg`
    }))
}