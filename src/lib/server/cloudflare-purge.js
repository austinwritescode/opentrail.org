import { env } from '$env/dynamic/private';

const BASE_URL = 'https://opentrail.org';

export async function purgeGetDataCache(trailNames) {
	const zoneId = env.CLOUDFLARE_ZONE_ID;
	const apiToken = env.CLOUDFLARE_API_TOKEN;
	if (!zoneId || !apiToken) {
		console.log('No CDN token found. Skipping purge')
		return;
	}

	const urls = trailNames.map((t) => `${BASE_URL}/api/getData?trail=${t}`);
	fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiToken}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ files: urls })
	}).then(async (res) => {
		const body = await res.json();
		if (res.ok && body.success) {
			console.log(`CDN purge success: ${urls.join(', ')}`);
		} else {
			console.error(`CDN purge failed: status=${res.status} body=${JSON.stringify(body)} trails=${trailNames}`);
		}
	}).catch((err) => {
		console.error(`CDN purge network error: ${err.message} trails=${trailNames}`);
	});
}
