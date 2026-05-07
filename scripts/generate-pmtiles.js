import Database from 'better-sqlite3';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pLimit from 'p-limit';
import { decodeTrail } from '../src/lib/decode-trail.js';

const require = createRequire(import.meta.url);
const { SphericalMercator } = require('@mapbox/sphericalmercator');

const CDN = 'https://cdn.opentrail.org';
const CONCURRENCY = 20;
const BATCH_SIZE = 100;

function parseArgs(argv) {
	const args = { trail: null, minZoom: 2, maxZoom: 14, corridor: 0.025, concurrency: CONCURRENCY, trailFile: null, output: null };
	let i = 2;
	while (i < argv.length) {
		const a = argv[i];
		if (a === '--min-zoom') { args.minZoom = parseInt(argv[++i]); }
		else if (a === '--max-zoom') { args.maxZoom = parseInt(argv[++i]); }
		else if (a === '--corridor') { args.corridor = parseFloat(argv[++i]); }
		else if (a === '--concurrency') { args.concurrency = parseInt(argv[++i]); }
		else if (a === '--trail-file') { args.trailFile = argv[++i]; }
		else if (a === '--output') { args.output = argv[++i]; }
		else if (!a.startsWith('-') && !args.trail) { args.trail = a; }
		else { console.error(`Unknown arg: ${a}`); process.exit(1); }
		i++;
	}
	if (!args.trail) { console.error('Usage: node generate-pmtiles.js <trail> [--min-zoom N] [--max-zoom N] [--corridor D] [--trail-file path] [--output path] [--concurrency N]'); process.exit(1); }
	if (!args.output) args.output = join(dirname(fileURLToPath(import.meta.url)), `${args.trail}.pmtiles`);
	return args;
}

function parseEnv(path) {
	const vars = {};
	const text = readFileSync(path, 'utf8');
	for (const line of text.split('\n')) {
		const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"?(.*?)"?\s*$/);
		if (m) vars[m[1]] = m[2];
	}
	return vars;
}

function decodeTrailData(data) {
	const fc = decodeTrail(data);
	return fc.features[0].geometry.coordinates;
}

function generateXYZ(coords, minZoom, maxZoom, corridor) {
	const merc = new SphericalMercator();
	const seen = new Set();
	for (const [lon, lat] of coords) {
		for (let z = minZoom; z <= maxZoom; z++) {
			const bbox = [lon - corridor, lat - corridor, lon + corridor, lat + corridor];
			const xyz = merc.xyz(bbox, z);
			for (let x = xyz.minX; x <= xyz.maxX; x++) {
				for (let y = xyz.minY; y <= xyz.maxY; y++) {
					seen.add(`${z}/${x}/${y}`);
				}
			}
		}
	}
	return Array.from(seen).map((k) => k.split('/').map(Number));
}

function createMBTiles(db, minZoom, maxZoom) {
	db.exec(`
		PRAGMA journal_mode=WAL;
		PRAGMA synchronous=OFF;
		CREATE TABLE IF NOT EXISTS metadata (name TEXT UNIQUE, value TEXT);
		CREATE TABLE IF NOT EXISTS tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB, UNIQUE (zoom_level, tile_column, tile_row));
	`);
	const insertMeta = db.prepare('INSERT OR REPLACE INTO metadata (name, value) VALUES (?, ?)');
	insertMeta.run('name', 'opentrail');
	insertMeta.run('format', 'pbf');
	insertMeta.run('minzoom', String(minZoom));
	insertMeta.run('maxzoom', String(maxZoom));
	return db.prepare('INSERT OR REPLACE INTO tiles (zoom_level, tile_column, tile_row, tile_data) VALUES (?, ?, ?, ?)');
}

async function fetchTile(url) {
	const res = await fetch(url);
	if (!res.ok) {
		const reason = res.status === 404 ? 'tile does not exist at this zoom/coord'
			: res.status === 422 ? 'invalid tile request (check TILE_URL template or tile coords)'
			: res.status === 403 ? 'access denied (check API key in TILE_URL)'
			: res.status === 429 ? 'rate limited'
			: `HTTP ${res.status}`;
		throw new Error(`Failed to fetch ${url}: ${reason}`);
	}
	const buf = await res.arrayBuffer();
	return Buffer.from(buf);
}

function cleanupMbtiles(mbtilesPath) {
	for (const suffix of ['', '-shm', '-wal']) {
		try { unlinkSync(mbtilesPath + suffix); } catch {}
	}
}

async function generatePmtiles(args, tileUrl) {
	const { trail, minZoom, maxZoom, corridor, concurrency, trailFile, output } = args;
	console.log(`\n=== Generating ${trail}.pmtiles ===`);

	console.log('Loading trail data...');
	let trailData;
	if (trailFile) {
		trailData = JSON.parse(readFileSync(trailFile, 'utf8'));
		console.log(`  Loaded from ${trailFile}`);
	} else {
		const url = `${CDN}/${trail}.json`;
		console.log(`  Fetching ${url}`);
		const res = await fetch(url);
		if (!res.ok) throw new Error(`Failed to fetch trail data from ${url}: HTTP ${res.status}`);
		trailData = await res.json();
	}
	const coords = decodeTrailData(trailData);
	console.log(`  ${coords.length} coordinate points`);

	console.log(`Generating tile list (zoom ${minZoom}-${maxZoom}, corridor ${corridor}°)...`);
	const xyzList = generateXYZ(coords, minZoom, maxZoom, corridor);
	console.log(`  ${xyzList.length} unique tiles`);

	const mbtilesPath = join(dirname(fileURLToPath(import.meta.url)), `${trail}.mbtiles`);
	let db;
	try {
		db = new Database(mbtilesPath);
		const insertTile = createMBTiles(db, minZoom, maxZoom);

		const limit = pLimit(concurrency);
		let completed = 0;
		const total = xyzList.length;

		const insertTransaction = db.transaction((entries) => {
			for (const [z, x, y, data] of entries) {
				insertTile.run(z, x, y, data);
			}
		});

		const batch = [];

		console.log('Scraping tiles...');
		await Promise.all(
			xyzList.map(([z, x, y]) =>
				limit(async () => {
					const url = tileUrl.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
					const data = await fetchTile(url);
					const tmsY = (1 << z) - 1 - y;
					batch.push([z, x, tmsY, data]);
					completed++;
					if (batch.length >= BATCH_SIZE) {
						const toWrite = batch.splice(0);
						insertTransaction(toWrite);
					}
					if (completed % 1000 === 0 || completed === total) {
						console.log(`  ${trail}: ${completed}/${total} tiles (${Math.round((completed / total) * 100)}%)`);
					}
				})
			)
		);

		if (batch.length > 0) {
			insertTransaction(batch);
		}

		db.exec(`
			CREATE INDEX IF NOT EXISTS tiles_idx ON tiles (zoom_level, tile_column, tile_row);
			ANALYZE;
		`);
		db.close();
		db = null;
		console.log(`Wrote ${mbtilesPath}`);

		const pmtilesExe = join(dirname(fileURLToPath(import.meta.url)), 'pmtiles.exe');
		console.log('Converting to PMTiles...');
		try {
			execSync(`"${pmtilesExe}" convert "${mbtilesPath}" "${output}"`, { stdio: 'pipe' });
		} catch (e) {
			throw new Error(`pmtiles convert failed: ${e.stderr?.toString().trim() || e.message}`);
		}
		console.log(`Wrote ${output}`);

		cleanupMbtiles(mbtilesPath);
		console.log(`Deleted ${mbtilesPath}`);

		console.log(`\nDone! Upload ${output} to ${CDN}/${trail}.pmtiles`);
	} catch (e) {
		if (db) { try { db.close(); } catch {} }
		cleanupMbtiles(mbtilesPath);
		try { unlinkSync(output); } catch {}
		throw e;
	}
}

const args = parseArgs(process.argv);
const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env');
const env = parseEnv(envPath);
if (!env.TILE_URL) {
	console.error('TILE_URL not found in .env');
	console.error('Add a line like: TILE_URL="https://example.com/{z}/{x}/{y}.pbf?key=..."');
	process.exit(1);
}

generatePmtiles(args, env.TILE_URL).catch((e) => {
	console.error(`\nFATAL: ${e.message}`);
	process.exit(1);
});
