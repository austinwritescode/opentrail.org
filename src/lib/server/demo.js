import { json } from '@sveltejs/kit';

// Fictional fixtures for the public test trail. No database or production writes.
const features = [
	['Demo campsite', 'c'],
	['Demo water source', 'w'],
	['Demo trail junction', 'j'],
	['Demo resupply', 't']
].map(([title, icon], i) => ({
	type: 'Feature',
	id: i,
	geometry: { type: 'Point', coordinates: [-117.0308 + i * 0.0006, 42.002] },
	properties: {
		title, icon, icons: icon, mile: (i * 0.1).toFixed(1), elev: 2303,
		desc: 'Fictional waypoint for local design testing. Submissions are disabled in demo mode.',
		images: [], dbid: i + 1, commentCount: 1,
		comments: [{ text: 'Sample comment for previewing the design.', user: 'Demo hiker', date: '2026-10-18' }]
	}
}));

export function demoResponse({ request, url }) {
	if (request.method === 'GET' && url.pathname === '/api/getData') {
		return json({ type: 'FeatureCollection', features: url.searchParams.get('trail') === 'test' ? features : [] }, {
			headers: { 'Cache-Control': 'no-store' }
		});
	}
	return new Response('Local demo: submissions, uploads and moderation are disabled. Use the normal development server with a test database to test saving.', { status: 403 });
}
