export function decodeTrail(data) {
	const scale = 10 ** data.p;
	const coords = [];
	let lon = data.lons[0] / scale;
	let lat = data.lats[0] / scale;
	let elev = data.elevs[0];
	coords.push([lon, lat, elev]);
	for (let i = 1; i < data.lons.length; i++) {
		lon += data.lons[i] / scale;
		lat += data.lats[i] / scale;
		elev += data.elevs[i];
		coords.push([lon, lat, elev]);
	}
	return {
		type: 'FeatureCollection',
		features: [{
			type: 'Feature',
			geometry: { type: 'LineString', coordinates: coords }
		}]
	};
}
