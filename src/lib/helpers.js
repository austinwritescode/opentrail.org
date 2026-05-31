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

export function haversine(lat1, lon1, lat2, lon2) {
  var R = 3958.8; // Radius of the earth in miles
  var dLat = deg2rad(lat2 - lat1); // deg2rad below
  var dLon = deg2rad(lon2 - lon1);
  var a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
    ;
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  var d = R * c; // Distance in miles
  return d;
}
function deg2rad(deg) {
  return deg * (Math.PI / 180)
}
function rad2deg(rad) {
  return rad * (180 / Math.PI)
}
export function bearing(lat1, lon1, lat2, lon2) {
  const dLon = deg2rad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(deg2rad(lat2));
  const x = Math.cos(deg2rad(lat1)) * Math.sin(deg2rad(lat2)) -
    Math.sin(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.cos(dLon);
  return (rad2deg(Math.atan2(y, x)) + 360) % 360;
}
export function formatRulerDist(miles, imperial) {
  if (imperial) {
    const ft = miles * 5280;
    return ft < 1000 ? Math.round(ft) + 'ft' : miles.toFixed(2) + 'mi';
  }
  const km = miToKm(miles);
  const m = km * 1000;
  return m < 1000 ? Math.round(m) + 'm' : km.toFixed(2) + 'km';
}

export function parseDescURL(desc) {
  return desc.split(/((?:(?:http:\/\/|https:\/\/|www.)\S+)|(?:\S+.com\S*))/)
}

export function isSafeURL(url) {
  return url.startsWith('http://') || url.startsWith('https://')
}

import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
dayjs.extend(relativeTime)

export function timeAgo(dateStr) {
  const then = dayjs(dateStr).startOf('day');
  const today = dayjs().startOf('day');
  const diffDays = today.diff(then, 'day');
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  return then.from(today);
}

export async function fetchWithProgress(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const total = parseInt(res.headers.get('content-length') || '0', 10);
  if (!total || !res.body) {
    onProgress(1);
    return res;
  }
  let received = 0;
  const reader = res.body.getReader();
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress(received / total);
  }
  const blob = new Blob(chunks);
  return new Response(blob, {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers
  });
}