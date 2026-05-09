import { get } from 'svelte/store';
import { downloadState, downloadPersist, settings, errorModal } from './store.js';
import { db } from './db';
import NoSleep from 'nosleep.js';
/** @type {import('nosleep.js').default | undefined} */
var noSleep;
if (typeof window !== 'undefined') noSleep = new NoSleep();

/** @param {string} trail */
function getPmtilesUrl(trail) {
	return `https://cdn.opentrail.org/${trail}.pmtiles`;
}

/**
 * @param {string} trail
 * @returns {Promise<number>} file size in bytes, or 0 if not found
 */
export async function getOPFSFileSize(trail) {
	try {
		const root = await navigator.storage.getDirectory();
		const handle = await root.getFileHandle(`${trail}.pmtiles`);
		const file = await handle.getFile();
		return file.size;
	} catch {
		return 0;
	}
}

/**
 * @param {string} trail
 */
async function deleteOPFSFile(trail) {
	try {
		const root = await navigator.storage.getDirectory();
		await root.removeEntry(`${trail}.pmtiles`);
	} catch {}
}

export async function resumeDownload() {
	const persist = get(downloadPersist);
	if (!persist || persist.status !== 'in_progress' || !persist.type) return;
	if (persist.trail !== get(settings).trail) return;

	const cachename = persist.type;
	const isOfflineCache = cachename === 'offline-cache';
	const displayName = isOfflineCache ? 'offline cache' : 'offline images';
	const onSuccess = isOfflineCache
		? () => settings.update((s) => { s.offline = true; return s; })
		: () => settings.update((s) => { s.offlineimages = true; return s; });
	const onDelete = isOfflineCache ? deleteOffline : deleteImages;

	try {
		if (isOfflineCache) {
			const fileSize = await getOPFSFileSize(persist.trail);
			const total = persist.totalBytes || fileSize;
			if (fileSize > 0 && fileSize >= total) {
				downloadPersist.update((p) => { p.status = 'complete'; return p; });
				downloadState.update((d) => { d.active = false; return d; });
				onSuccess();
				return;
			}
			await streamPmtiles(
				persist.trail,
				fileSize > 0 ? fileSize : (persist.bytesReceived || 0),
				persist.totalBytes || 0,
				'Resuming offline cache',
				onSuccess,
				onDelete
			);
		} else {
			const cache = await caches.open('image-cache');
			const res = await fetch(`/api/getImageList?trail=${persist.trail}`);
			const list = await res.json();
			/** @type {string[]} */
			const URLlist = list.map((/** @type {number} */ num) => `https://cdn.opentrail.org/img/${num}.jpg`);
			const remaining = [];
			for (const url of URLlist) {
				const cached = await cache.match(url);
				if (!cached) remaining.push(url);
			}
			if (remaining.length === 0) {
				downloadPersist.update((p) => { p.status = 'complete'; return p; });
				downloadState.update((d) => { d.active = false; return d; });
				onSuccess();
				return;
			}
			const pLimit = (await import('p-limit')).default;
			const limit = pLimit(5);
			const alreadyDownloaded = URLlist.length - remaining.length;
			downloadState.set({
				active: true,
				type: cachename,
				displayName: `Resuming ${displayName}`,
				downloaded: alreadyDownloaded,
				total: URLlist.length,
				trail: persist.trail,
				onCancel: () => {
					limit.clearQueue();
					onDelete();
					noSleep?.disable();
				}
			});
			noSleep?.enable();
			await Promise.all(
				remaining.map((url) =>
					limit(async () => {
						await cache.add(url);
						downloadState.update((d) => { d.downloaded++; return d; });
						const state = get(downloadState);
						if (state.downloaded === state.total) {
							downloadState.update((d) => { d.active = false; return d; });
							downloadPersist.update((p) => { p.status = 'complete'; return p; });
							noSleep?.disable();
							onSuccess();
						}
					})
				)
			);
		}
	} catch (/** @type {any} */ e) {
		onDelete();
		noSleep?.disable();
		errorModal(/** @type {Error} */ (e));
	}
}

/** @type {AbortController | null} */
let downloadAbortController = null;

/**
 * @param {string} trail
 * @param {number} startBytes
 * @param {number} totalBytes
 * @param {string} displayName
 * @param {() => void} onSuccess
 * @param {() => void} onDelete
 */
export async function streamPmtiles(trail, startBytes, totalBytes, displayName, onSuccess, onDelete) {
	const url = getPmtilesUrl(trail);
	downloadAbortController = new AbortController();

	downloadState.set({
		active: true,
		type: 'offline-cache',
		displayName: displayName,
		downloaded: startBytes,
		total: totalBytes,
		trail: trail,
		onCancel: () => {
			downloadAbortController?.abort();
			onDelete();
			noSleep?.disable();
		}
	});
	noSleep?.enable();

	/** @type {RequestInit} */
	const fetchOpts = { signal: downloadAbortController.signal };
	if (startBytes > 0) {
		const headers = new Headers();
		headers.set('Range', `bytes=${startBytes}-`);
		fetchOpts.headers = headers;
	}

	const response = await fetch(url, fetchOpts);

	if (!totalBytes) {
		if (response.status === 206) {
			const contentRange = response.headers.get('Content-Range');
			const match = contentRange?.match(/\/(\d+)/);
			totalBytes = match ? parseInt(match[1]) : parseInt(response.headers.get('Content-Length') || '0') + startBytes;
		} else {
			totalBytes = parseInt(response.headers.get('Content-Length') || '0');
		}
	}

	downloadPersist.update((p) => {
		p.status = 'in_progress';
		p.bytesReceived = startBytes;
		p.totalBytes = totalBytes;
		return p;
	});
	downloadState.update((d) => { d.total = totalBytes; return d; });

	const root = await navigator.storage.getDirectory();
	const fileHandle = await root.getFileHandle(`${trail}.pmtiles`, { create: true });
	const writable = await fileHandle.createWritable({ keepExistingData: startBytes > 0 });

	const body = response.body;
	if (!body) throw new Error('Response body is null');
	const reader = body.getReader();
	let writeOffset = startBytes;

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			await writable.write(value, { at: writeOffset });
			writeOffset += value.length;

			downloadState.update((d) => { d.downloaded = writeOffset; return d; });
			downloadPersist.update((p) => { p.bytesReceived = writeOffset; return p; });
		}
	} catch (e) {
		await writable.abort();
		throw e;
	}

	await writable.close();

	downloadPersist.update((p) => {
		p.status = 'complete';
		p.bytesReceived = 0;
		p.totalBytes = 0;
		return p;
	});
	downloadState.update((d) => { d.active = false; return d; });
	noSleep?.disable();
	onSuccess();
}

export async function deleteOffline() {
	const trail = get(settings).trail;
	try {
		await db.pending.clear();
	} catch {}
	await deleteOPFSFile(trail);
	await caches.delete('offline-cache');
	await caches.delete('image-cache');
	settings.update((s) => { s.offline = false; s.offlineimages = false; return s; });
	downloadState.update((d) => { d.active = false; return d; });
	downloadPersist.update((p) => {
		p.status = '';
		p.bytesReceived = 0;
		p.totalBytes = 0;
		return p;
	});
}

export async function deleteImages() {
	await caches.delete('image-cache');
	settings.update((s) => { s.offlineimages = false; return s; });
	downloadState.update((d) => { d.active = false; return d; });
	downloadPersist.update((p) => { p.status = ''; return p; });
}
