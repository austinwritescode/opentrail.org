/** @type {Record<string, {label:string, color:string}>} */
export const waypointKinds = {
	c: {
		label: 'Campsite / shelter',
		color: '#2E9E6B'
	},
	w: {
		label: 'Reliable water',
		color: '#2B87C9'
	},
	s: {
		label: 'Seasonal water',
		color: '#2B87C9'
	},
	j: {
		label: 'Trail junction',
		color: '#F2B83A'
	},
	r: {
		label: 'Road crossing',
		color: '#3A4A47'
	},
	t: { label: 'Town / resupply', color: '#A0703F' },
	o: { label: 'Point of interest', color: '#7A55C7' },
	a: { label: 'Alert', color: '#D93A3A' }
};
const badges = import.meta.glob('./assets/icons/waypoints/badge-*.svg', {
	query: '?raw',
	import: 'default',
	eager: true
});
const names = {
	c: 'campsite',
	w: 'water',
	s: 'water',
	j: 'junction',
	r: 'road',
	t: 'town',
	o: 'viewpoint',
	a: 'alert'
};

/** @param {string} kind */
export function waypointBadgeSVG(kind) {
	const source = String(
		badges['./assets/icons/waypoints/badge-' + (names[kind] || 'viewpoint') + '.svg']
	);
	// Seasonal water keeps its distinguishing slash; the supplied set has one water symbol.
	return kind === 's'
		? source.replace(
				'</svg>',
				'<path d="M12 36L36 12" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round"/></svg>'
			)
		: source;
}

/** @param {string} kind */
export function waypointSVG(kind, selected = false) {
	const badge = waypointBadgeSVG(kind).replace(
		'width="48" height="48"',
		'x="5" y="5" width="30" height="30"'
	);
	return `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 40 40"><circle cx="20" cy="20" r="${selected ? 19 : 17}" fill="white" stroke="${selected ? '#0E3B32' : 'white'}" stroke-width="2"/>${badge}</svg>`;
}
