export function mToFt(m) {
    return m * 3.28084
}

export function ftToM(ft) {
    return ft / 3.28084
}

export function miToKm(mi) {
    return mi * 1.60934
}

export function kmToMi(km) {
    return km / 1.60934
}

export function formatElev(meters, imperial) {
    if (meters == null) return ''
    if (imperial) return Math.round(mToFt(meters)).toLocaleString('en-US') + 'ft'
    return Math.round(meters).toLocaleString('en-US') + 'm'
}

export function formatDist(miles, imperial, decimals) {
    if (miles == null) return ''
    if (imperial) return miles.toFixed(decimals) + 'mi'
    return miToKm(miles).toFixed(decimals) + 'km'
}

export function searchTrailRoute(lng, lat, geoJSON, maxDist) {
    const coords = geoJSON.features[0].geometry.coordinates
    let min = { dist: maxDist, index: -1 }
    coords.forEach((coord, index) => {
        const dist = haversine(coord[1], coord[0], lat, lng) //todo: optimize the search pattern using proximity constraint
        if (dist < min.dist) min = { dist: dist, index: index }
    })
    // console.log(`trail: ${trail} min: ${min.dist} index: ${min.index}`)
    return min
}

function haversine(lat1, lon1, lat2, lon2) {
    var R = 3958.8; // Radius of the earth in miles
    var dLat = deg2rad(lat2 - lat1);  // deg2rad below
    var dLon = deg2rad(lon2 - lon1);
    var a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2)
        ;
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c; // Distance in km
    return d;
}
function deg2rad(deg) {
    return deg * (Math.PI / 180)
}

export function parseDescURL(desc) {
    return desc.split(/((?:(?:http:\/\/|https:\/\/|www.)\S+)|(?:\S+.com\S*))/)
}

export function isSafeURL(url) {
    return url.startsWith('http://') || url.startsWith('https://')
}