import { settings, data, openModal, errorModal } from '$lib/store.js'
import { get } from 'svelte/store';
import { db } from '$lib/db.js';
import dayjs from 'dayjs';

export async function getData() {
    console.log('fetching data')
    const trail = get(settings).trail
    const res = await fetch('/api/getData?' + new URLSearchParams({ trail: trail }));
    if (res.status === 200) {
        const json = await res.json();
        data.set(json)
        const cache = await caches.open('offline-cache');
        await cache.add('/api/getData?trail=' + get(settings).trail);
        console.log('Data fetch successful')
    } else throw new Error('Failed to retrieve data: ' + res.status);
}

export async function postGeneric(item, resync = true) {
    console.log('posting: ')
    console.log(item)
    try {
        let body = item.data
        if (!item.route.startsWith('postImage')) body = JSON.stringify({
            ...item.data,
            user: get(settings).username
        })
        const res = await fetch(`/api/${item.route}`, {
            method: 'POST',
            body: body
        });
        if (res.status === 200) {
            console.log('post successful');
            if (item.route !== 'postComment') openModal({
                type: 'success',
                data: 'Successfully submitted. It may take a day to appear since the map is manually moderated to prevent abuse. Thank you for your contribution!'
            });
            if (resync) getData()
        }
        else {
            console.log('post received non-200 response')
            const err = await res.text()
            errorModal(`Error: ${res.status} ${err}`)
        }
        return true
    } catch (err) {
        if (err.message === 'Failed to fetch' && get(settings).offline) {
            console.log('putting post in pending db')
            await db.pending.add(item);
            openModal({ type: 'success', data: 'No connection. Submission queued for the next sync.' });
        }
        else {
            console.log('post unsuccessful and not offline, throwing error')
            const e = new Error(err.message + ' and not in offline mode to save to pending queue.')
            errorModal(e.message)
            throw e
        }
    }
}

export async function syncData() {
    console.log('syncing data')
    const pending = await db.pending.toArray();
    for (const item of pending) {
        const success = await postGeneric(item, false);
        if (success) await db.pending.delete(item.id);
    }
    await getData();
    settings.update((n) => { n.lastsync = new dayjs(); return n })
}