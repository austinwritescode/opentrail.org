import { settings, data, openModal, handleError } from '$lib/store.js';
import { get } from 'svelte/store';
import { db } from '$lib/db';
import dayjs from 'dayjs';

export async function getData(forceNetwork = false) {
	const trail = get(settings).trail;
	const url = '/api/getData?trail=' + trail;
	const hasCaches = typeof caches !== 'undefined';

	if (!forceNetwork && hasCaches) {
		const cache = await caches.open('offline-cache');
		const cached = await cache.match(url);
		if (cached) {
			data.set(await cached.json());
			if (navigator.onLine) refreshData(url, cache);
			return;
		}
	}

	const fetchUrl = forceNetwork ? url + '&_nocache=1' : url;
	const res = await fetch(fetchUrl);
	if (res.status === 200) {
		const clone = res.clone();
		data.set(await res.json());
		if (hasCaches) {
			const cache = await caches.open('offline-cache');
			await cache.put(url, clone);
		}
		settings.update((s) => {
			s.lastsync = new dayjs();
			return s;
		});
	} else {
		throw new Error('Failed to retrieve data: ' + res.status);
	}
}

async function refreshData(url, cache) {
	try {
		const cached = await cache.match(url);
		const etag = cached?.headers.get('ETag');
		const headers = {};
		if (etag) headers['If-None-Match'] = etag;

		const res = await fetch(url, { headers });
		if (res.status === 304) {
			settings.update((s) => {
				s.lastsync = new dayjs();
				return s;
			});
			return;
		}
		if (res.status === 200) {
			const clone = res.clone();
			const json = await res.json();
			data.set(json);
			await cache.put(url, clone);
			settings.update((s) => {
				s.lastsync = new dayjs();
				return s;
			});
		}
	} catch {}
}

export async function postGeneric(item, getDataAfter = true, pendingAdd = true) {
	let body = item.data;
	if (!item.route.startsWith('postImage'))
		body = JSON.stringify({
			...item.data,
			user: get(settings).username
		});

	let res;
	try {
		res = await fetch(`/api/${item.route}`, {
			method: 'POST',
			body: body
		});
	} catch (err) {
		if (get(settings).offline) {
			if (pendingAdd) await db.pending.add(item);
			openModal({ type: 'success', data: 'No connection. Submission queued for the next sync.' });
		} else {
			const e = new Error(err.message + ' and not in offline mode to save to pending queue.');
			handleError(e, { modal: true, sentry: true });
			throw e;
		}
		return;
	}
	if (res.status === 200) {
		if (item.route !== 'postComment')
			openModal({
				type: 'success',
				data: 'Successfully submitted. It may take a day to appear since the map is manually moderated to prevent abuse. Thank you for your contribution!'
			});
		if (getDataAfter) getData(true);
		return true;
	} else {
		const err = await res.text();
		handleError(new Error(`Error: ${res.status} ${err}`), { modal: true, sentry: true });
		return false;
	}
}

export async function syncData() {
	if (!navigator.onLine) return;
	const pending = await db.pending.toArray();
	for (const item of pending) {
		let success;
		try {
			success = await postGeneric(item, false, false);
		} catch (err) {
			break;
		}
		if (success) {
			await db.pending.delete(item.id);
		} else {
			break;
		}
	}
	await getData();
}
