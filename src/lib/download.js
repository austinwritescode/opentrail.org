import { get } from 'svelte/store';
import { downloadState, downloadPersist, settings, handleError } from './store.js';
import { db } from './db';
import { hold, unhold } from './wakeLock.js';
import * as Sentry from '@sentry/sveltekit';

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

	hold();
	try {
		if (isOfflineCache) {
			const fileSize = await getOPFSFileSize(persist.trail);
			const total = persist.totalBytes || fileSize;
			if (fileSize > 0 && fileSize >= total) {
				downloadPersist.update((p) => {
					p.status = 'complete';
					return p;
				});
				downloadState.update((d) => {
					d.active = false;
					return d;
				});
				await resumeImageDownload(persist.trail);
				settings.update((s) => {
					s.offline = true;
					return s;
				});
				return;
			}
			await streamPmtiles(
				persist.trail,
				fileSize > 0 ? fileSize : persist.bytesReceived || 0,
				persist.totalBytes || 0,
				'Resuming offline cache'
			);
			await resumeImageDownload(persist.trail);
			settings.update((s) => {
				s.offline = true;
				return s;
			});
		} else {
			await resumeImageDownload(persist.trail);
			settings.update((s) => {
				s.offline = true;
				return s;
			});
		}
	} catch (/** @type {any} */ e) {
		deleteOffline();
		if (e?.name !== 'AbortError') {
			handleError(/** @type {Error} */ (e), { modal: true, sentry: true });
		}
	} finally {
		unhold();
	}
}

/** @param {string} trail */
async function resumeImageDownload(trail) {
	if (typeof caches === 'undefined') {
		throw new Error('Caches API not available. Ensure you are using HTTPS.');
	}
	const cache = await caches.open('image-cache');
	const res = await fetch(`/api/getImageList?trail=${trail}`);
	const list = await res.json();
	/** @type {string[]} */
	const URLlist = list.map(
		(/** @type {number} */ num) => `https://cdn.opentrail.org/img/${num}.jpg`
	);
	const remaining = [];
	for (const url of URLlist) {
		const cached = await cache.match(url);
		if (!cached) remaining.push(url);
	}
	if (remaining.length === 0) {
		downloadPersist.update((p) => {
			p.status = 'complete';
			return p;
		});
		downloadState.update((d) => {
			d.active = false;
			return d;
		});
		return;
	}
	const pLimit = (await import('p-limit')).default;
	const limit = pLimit(5);
	const alreadyDownloaded = URLlist.length - remaining.length;
	downloadState.set({
		active: true,
		type: 'image-cache',
		displayName: 'Resuming offline images',
		downloaded: alreadyDownloaded,
		total: URLlist.length,
		trail: trail,
		onCancel: () => {
			limit.clearQueue();
		}
	});
	await Promise.all(
		remaining.map((url) =>
			limit(async () => {
				await cache.add(url);
				downloadState.update((d) => {
					d.downloaded++;
					return d;
				});
				const state = get(downloadState);
				if (state.downloaded === state.total) {
					downloadState.update((d) => {
						d.active = false;
						return d;
					});
					downloadPersist.update((p) => {
						p.status = 'complete';
						return p;
					});
				}
			})
		)
	);
}

/** @type {AbortController | null} */
let downloadAbortController = null;

/**
 * @param {string} trail
 * @param {number} startBytes
 * @param {number} totalBytes
 * @param {string} displayName
 */
export async function streamPmtiles(trail, startBytes, totalBytes, displayName) {
	const url = getPmtilesUrl(trail);
	downloadAbortController = new AbortController();

	Sentry.metrics.count('client.download.started', 1, { tags: { trail, type: 'offline-cache' } });

	downloadState.set({
		active: true,
		type: 'offline-cache',
		displayName: displayName,
		downloaded: startBytes,
		total: totalBytes,
		trail: trail,
		onCancel: () => {
			Sentry.metrics.count('client.download.cancelled', 1, { tags: { trail } });
			downloadAbortController?.abort();
			if (opfsWorker) {
				opfsWorker.postMessage({ type: 'abort', startBytes });
				opfsWorker.terminate();
				opfsWorker = null;
			}
		}
	});

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
			totalBytes = match
				? parseInt(match[1])
				: parseInt(response.headers.get('Content-Length') || '0') + startBytes;
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
	downloadState.update((d) => {
		d.total = totalBytes;
		return d;
	});

	/** @type {Worker | null} */
	let opfsWorker = null;
	/** @type {((reason?: any) => void) | null} */
	let workerReject = null;
	/**
	 * @param {string} type
	 * @param {{ transferables?: Transferable[]; [key: string]: any }} data
	 */
	function workerMessage(type, data = {}) {
		return new Promise((resolve, reject) => {
			if (!opfsWorker) return reject(new Error('Worker not initialized'));
			workerReject = reject;
			opfsWorker.onmessage = (e) => {
				workerReject = null;
				if (e.data.error) reject(new Error(e.data.error));
				else resolve(e.data);
			};
			const transferables = data.transferables || [];
			const { transferables: _, ...rest } = data;
			opfsWorker.postMessage({ type, ...rest }, transferables);
		});
	}

	const body = response.body;
	if (!body) throw new Error('Response body is null');
	const reader = body.getReader();
	let writeOffset = startBytes;

	opfsWorker = new Worker(new URL('./opfs-worker.js', import.meta.url), { type: 'module' });
	opfsWorker.onerror = (e) => {
		if (workerReject) workerReject(new Error(e.message || 'Worker failed to load'));
		workerReject = null;
	};

	try {
		await workerMessage('open', { trail, startBytes });
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			const chunkLength = value.length;
			await workerMessage('write', {
				data: value.buffer,
				offset: writeOffset,
				transferables: [value.buffer]
			});
			writeOffset += chunkLength;

			downloadState.update((d) => {
				d.downloaded = writeOffset;
				return d;
			});
			downloadPersist.update((p) => {
				p.bytesReceived = writeOffset;
				return p;
			});
		}
		await workerMessage('flush');
		await workerMessage('close');
		opfsWorker.terminate();
		opfsWorker = null;
	} catch (e) {
		if (opfsWorker) {
			opfsWorker.postMessage({ type: 'abort', startBytes });
			opfsWorker.terminate();
			opfsWorker = null;
		}
		throw e;
	}

	downloadPersist.update((p) => {
		p.status = 'complete';
		p.bytesReceived = 0;
		p.totalBytes = 0;
		return p;
	});
	Sentry.metrics.distribution('client.download.completed_bytes', writeOffset, { tags: { trail } });
	downloadState.update((d) => {
		d.active = false;
		return d;
	});
}

export async function deleteOffline() {
	const trail = get(settings).trail;
	Sentry.metrics.count('client.offline_cache.deleted', 1, { tags: { trail } });
	try {
		await db.pending.clear();
	} catch {}
	await deleteOPFSFile(trail);
	if (typeof caches !== 'undefined') {
		await caches.delete('offline-cache');
		await caches.delete('image-cache');
	}
	settings.update((s) => {
		s.offline = false;
		return s;
	});
	downloadState.update((d) => {
		d.active = false;
		return d;
	});
	downloadPersist.update((p) => {
		p.status = '';
		p.bytesReceived = 0;
		p.totalBytes = 0;
		return p;
	});
}
