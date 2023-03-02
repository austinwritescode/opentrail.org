import { PrismaClient } from '$lib/prisma.ts'
const prisma = new PrismaClient()
import { env } from '$env/dynamic/private'
import { S3Client, PutObjectCommand, ListObjectsCommand } from "@aws-sdk/client-s3";
const s3 = new S3Client({
    region: 'auto',
    endpoint: env.S3_ENDPOINT,
    credentials: {
        accessKeyId: env.S3_ACCESS_ID,
        secretAccessKey: env.S3_SECRET_KEY,
    }
})

let nextURL = 0
let initialized = false

async function initializeCount() {
    const imgs = await s3.send(new ListObjectsCommand({ Bucket: 'opentrail-static', Prefix: 'img' }))
    console.log('getting current consecutive image url')
    if (imgs.Contents) {
        for (const img of imgs.Contents) {
            const pathArray = img.Key.split('/')
            const num = parseInt(pathArray.pop()?.split('.')[0])
            if (num >= nextURL) nextURL = num + 1
        }
    }
    console.log(`Initialized image poster with nextURL: ${nextURL}.jpg`)
    initialized = true
}

export async function POST({ request, url }) {
    console.log('received image post')
    if (!initialized) await initializeCount()
    try {
        const key = url.searchParams.get('key')
        if (!key) {
            let ip = request.headers.get("x-forwarded-for") || ''
            if (ip !== '') ip = ip.split(',').slice(0, -1).join(',')
            console.log(`received image from ip [${ip}] / user [${req.user}]`)
            const blob = await request.blob()
            if (blob.size > 100000) throw new Error('Image too large. Try cropping the height to 400px or 500px first.')
            const buff = await blob.arrayBuffer()
            const dbid = url.searchParams.get('id')
            await prisma.moderation.create({
                data: {
                    date: new Date(),
                    request: { dbid: dbid },
                    route: `${url.pathname}?${url.searchParams}`,
                    ip: ip,
                    image: Buffer.from(buff)
                }
            })
            return new Response()
        }
        else if (key !== env.MOD_KEY) {
            console.log(`failed moderator login from ip [${ip}]`)
            return new Response(null, { status: 403 })
        }
        else {
            console.log('mod posting image')
            const modId = url.searchParams.get('mod_id')
            const imageLookup = await prisma.moderation.findUnique({
                where: { id: parseInt(modId) },
                select: { image: true, route: true }
            })
            const params = new URLSearchParams(imageLookup.route.split('?')[1])
            const res = await s3.send(new PutObjectCommand({
                Bucket: 'opentrail-static',
                Key: `img/${nextURL}.jpg`,
                ContentType: "image/jpeg",
                ACL: "public-read",
                Body: imageLookup.image
            }))
            if (res['$metadata'].httpStatusCode === 200) {
                await prisma.marker.update({
                    where: {
                        id: parseInt(params.get('id'))
                    },
                    data: {
                        images: {
                            push: nextURL
                        }
                    }
                })
                console.log(`uploaded to r2 as ${nextURL}.jpg`)
                nextURL++
                return new Response();
            }
            else throw new Error('Error storing image')
        }
    } catch (e) {
        console.log(e)
        return new Response(e.message, { status: 400 })
    }
}
