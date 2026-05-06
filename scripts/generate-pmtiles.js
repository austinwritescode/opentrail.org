import Database from 'better-sqlite3';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pLimit from 'p-limit';

const CDN = 'https://cdn.opentrail.org';
const TRAILS = ['PCT', 'AT', 'CDT', 'test'];
const CONCURRENCY = 20;

async function fetchJson(url) {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
	return res.json();
}

async function fetchTile(url) {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
	const buf = await res.arrayBuffer();
	return Buffer.from(buf);
}

function createMBTiles(db) {
	db.exec(`
		PRAGMA journal_mode=WAL;
		PRAGMA synchronous=OFF;
  CREATE TABLE IF NOT EXISTS metadata (name TEXT UNIQUE, value TEXT);
  CREATE TABLE IF NOT EXISTS tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB, UNIQUE (zoom_level, tile_column, tile_row));
	`);
	const insertMeta = db.prepare('INSERT OR REPLACE INTO metadata (name, value) VALUES (?, ?)');
	insertMeta.run('name', 'opentrail');
	insertMeta.run('format', 'pbf');
	insertMeta.run('minzoom', '2');
	insertMeta.run('maxzoom', '14');
	return db.prepare('INSERT OR REPLACE INTO tiles (zoom_level, tile_column, tile_row, tile_data) VALUES (?, ?, ?, ?)');
}

async function generateForTrail(trail) {
	console.log(`\n=== Processing ${trail} ===`);
	const xyzUrl = `${CDN}/${trail}.xyz`;
	console.log(`Fetching tile list: ${xyzUrl}`);
	const xyzData = await fetchJson(xyzUrl);
	const xyzList = xyzData[0];
	console.log(`Total tiles: ${xyzList.length}`);

	const mbtilesPath = join(dirname(fileURLToPath(import.meta.url)), `${trail}.mbtiles`);
	const db = new Database(mbtilesPath);
	const insertTile = createMBTiles(db);

	const limit = pLimit(CONCURRENCY);
	let completed = 0;
	const total = xyzList.length;

	const insertTransaction = db.transaction((entries) => {
		for (const [z, x, y, data] of entries) {
			insertTile.run(z, x, y, data);
		}
	});

	const batch = [];
	const BATCH_SIZE = 100;

	await Promise.all(
		xyzList.map(([x, y, z]) =>
			limit(async () => {
				const url = `${CDN}/tiles/${z}/${x}/${y}.pbf`;
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

	console.log(`Wrote ${mbtilesPath}`);
	console.log(`\nNext step: pmtiles convert ${trail}.mbtiles ${trail}.pmtiles`);
}

for (const trail of TRAILS) {
	await generateForTrail(trail);
}

console.log('\nDone! Now run:');
for (const trail of TRAILS) {
	console.log(`  pmtiles convert ${trail}.mbtiles ${trail}.pmtiles`);
}
console.log('\nThen upload the .pmtiles files to cdn.opentrail.org');
