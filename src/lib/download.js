import { get } from 'svelte/store';
import { downloadState, downloadPersist, settings, errorModal } from './store.js';
import { db } from './db';
import pLimit from 'p-limit';
const limit = pLimit(5);
import NoSleep from 'nosleep.js';
var noSleep;
if (typeof window !== 'undefined') noSleep = new NoSleep();

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
	const onDelete = isOfflineCache
		? deleteOffline
		: deleteImages;

	try {
		let URLlist;
		if (isOfflineCache) {
			const res = await fetch(`https://cdn.opentrail.org/${persist.trail}.xyz`);
			const xyzlist = (await res.json())[0];
			URLlist = xyzlist.map(
				(xyz) => `https://cdn.opentrail.org/tiles/${xyz[2]}/${xyz[0]}/${xyz[1]}.pbf`
			);
		} else {
			const res = await fetch(`/api/getImageList?trail=${persist.trail}`);
			const list = await res.json();
			URLlist = list.map((num) => `https://cdn.opentrail.org/img/${num}.jpg`);
		}

		const cache = await caches.open(cachename);
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
				noSleep.disable();
			}
		});
		noSleep.enable();

		await Promise.all(
			remaining.map((url) =>
				limit(async () => {
					await cache.add(url);
					downloadState.update((d) => { d.downloaded++; return d; });
					const state = get(downloadState);
					if (state.downloaded === state.total) {
						downloadState.update((d) => { d.active = false; return d; });
						downloadPersist.update((p) => { p.status = 'complete'; return p; });
						noSleep.disable();
						onSuccess();
					}
				})
			)
		);
	} catch (e) {
		onDelete();
		noSleep.disable();
		errorModal(e.message);
	}
}

async function deleteOffline() {
	try {
		await db.pending.clear();
	} catch {}
	await caches.delete('offline-cache');
	await caches.delete('image-cache');
	settings.update((s) => { s.offline = false; s.offlineimages = false; return s; });
	downloadState.update((d) => { d.active = false; return d; });
	downloadPersist.update((p) => { p.status = ''; return p; });
}

async function deleteImages() {
	await caches.delete('image-cache');
	settings.update((s) => { s.offlineimages = false; return s; });
	downloadState.update((d) => { d.active = false; return d; });
	downloadPersist.update((p) => { p.status = ''; return p; });
}
