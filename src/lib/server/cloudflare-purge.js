import { env } from '$env/dynamic/private';

const BASE_URL = 'https://opentrail.org';

export async function purgeGetDataCache(trailNames) {
	const zoneId = env.CLOUDFLARE_ZONE_ID;
	const apiToken = env.CLOUDFLARE_API_TOKEN;
	if (!zoneId || !apiToken) return;

	const urls = trailNames.map((t) => `${BASE_URL}/api/getData?trail=${t}`);
	fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiToken}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ files: urls })
	}).catch(() => {});
}
