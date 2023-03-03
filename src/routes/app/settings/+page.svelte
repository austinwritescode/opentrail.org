<script lang="ts">
	import { db } from '$lib/db.js';
	import { getData, syncData } from '$lib/api.js';
	import { liveQuery } from 'dexie';
	import { browser, dev } from '$app/environment';
	import { goto } from '$app/navigation';
	import { settings, openModal, errorModal, modal, bgFetchStatus, TRAILS } from '$lib/store.js';
	import pLimit from 'p-limit';
	const limit = pLimit(15); //fetch concurrency limit
	import { onMount } from 'svelte';
	import dayjs from 'dayjs';
	import relativeTime from 'dayjs/plugin/relativeTime';
	dayjs.extend(relativeTime);
	import prettyBytes from 'pretty-bytes';
	import NoSleep from 'nosleep.js';
	var noSleep;
	if (browser) noSleep = new NoSleep();

	let syncSpinner = false;
	let fetchSpinner = false;
	let storageEstimate = '';

	onMount(updateStorageEstimate);
	$: if ($settings.offline) updateStorageEstimate();
	async function updateStorageEstimate() {
		if (navigator && navigator.storage) {
			const estimate = await navigator.storage.estimate();
			storageEstimate = `${prettyBytes(estimate.usage)} (${prettyBytes(estimate.quota)} available)`;
		}
	}

	function toggle(key) {
		$settings[key] = !$settings[key];
	}
	let settingsWrapper;
	async function changeTrail(newTrail) {
		$settings.trail = newTrail;
		deleteOffline();
		await getData();
		const event = new CustomEvent('repopulateMap', { bubbles: true });
		settingsWrapper.dispatchEvent(event);
		goto('/app');
	}

	let pendingCount = liveQuery(() => (browser ? db.pending.count() : 0));
	$: pendingSublabel =
		$pendingCount > 0 ? [['Pending uploads: ' + $pendingCount, null, null, true]] : [];
	$: offlineSublabels = $settings.offline
		? [
				[`Size: ${storageEstimate}`, null, null, true],
				...pendingSublabel,
				['Last sync: ' + $settings.lastsync.fromNow(), 'Sync', syncDataWithSpinner, true],
				['Automatic sync', $settings.autosync, toggleAutosync, true],
				['Offline images', $settings.offlineimages, toggleImages, true]
				//['Save satellite', $settings.enablesat, () => toggle('enablesat'), true] //todo
		  ]
		: [];
	$: labels = [
		//left label, right label, callback, subsetting
		['Trail', $settings.trail, openTrailModal, false],
		[
			'Direction',
			$settings.reverseMiles ? 'Southbound' : 'Northbound',
			() => toggle('reverseMiles'),
			true
		],
		['Offline cache', $settings.offline, toggleOffline, false],
		...offlineSublabels,
		['Username', $settings.username, openUsernameModal, false],
		['Dark mode', $settings.dark, () => toggle('dark'), false],
		['Community guidelines', '', () => openModal({ type: 'community' }), false],
		['About', '', () => openModal({ type: 'about' }), false]
	];
	function openUsernameModal() {
		openModal({
			type: 'text',
			data: ['Change username', $settings.username],
			submit: (data) => ($settings.username = data[1])
		});
	}
	function openTrailModal() {
		openModal({
			type: 'trail',
			submit: (data) => {
				if ($settings.offline && $settings.trail !== data)
					openModal({
						type: 'warning',
						data: "This will delete your offline cache and can't be undone.",
						submit: () => changeTrail(data)
					});
				else changeTrail(data);
			}
		});
	}

	function toggleOffline() {
		if ($settings.offline)
			openModal({
				type: 'warning',
				data: "This will delete your offline cache and can't be undone.",
				submit: deleteOffline
			});
		else
			openModal({
				type: 'confirmFetch',
				data: ['offline cache', TRAILS[$settings.trail].size],
				submit: fetchOffline
			});
	}

	function toggleImages() {
		if ($settings.offlineimages)
			openModal({
				type: 'warning',
				data: "This will delete your offline images and can't be undone.",
				submit: deleteImages
			});
		else
			openModal({
				type: 'confirmFetch',
				data: ['offline images', TRAILS[$settings.trail].sizeImages],
				submit: fetchImages
			});
	}

	function toggleAutosync() {
		$settings.autosync = !$settings.autosync;
		if ($settings.autosync) {
			window.addEventListener('online', syncDataWithSpinner);
			syncDataWithSpinner();
		} else {
			window.removeEventListener('online', syncDataWithSpinner);
		}
	}

	let currentDownloadType;
	async function fetchOffline() {
		if (!navigator.serviceWorker)
			return errorModal('No service worker found. Refresh the page and try again.');
		if (!navigator.serviceWorker.controller && !dev)
			return errorModal('Service worker not ready. Refresh the page and try again.');
		const persisted = await navigator.storage.persist();
		if (!persisted)
			return errorModal('No persistent storage found. Check your browser permissions. If your phone is out of date it may not support persistent storage.');

		await caches.delete('offline-cache');
		const cache = await caches.open('offline-cache');
		try {
			currentDownloadType = 'Offline cache';
			if ('BackgroundFetchManager' in self) fetchSpinner = true;
			else {
				openModal({
					type: 'progress',
					data: [0, 0, 'Downloading offline cache'],
					cancel: deleteOffline
				});
			}
			// First add trail specific files to cache
			const trailData = [
				`https://cdn.opentrail.org/${$settings.trail}.json`,
				`/api/getData?trail=${$settings.trail}`
			];
			await cache.addAll(trailData);
			// Then fetch tile list
			const res = await fetch(`https://cdn.opentrail.org/${$settings.trail}.xyz`);
			const xyzlist = (await res.json())[0];
			const URLlist = xyzlist.map(
				(xyz) => `https://cdn.opentrail.org/tiles/${xyz[2]}/${xyz[0]}/${xyz[1]}.pbf`
			);
			// Then fetch the tiles:
			await cacheFromList(
				URLlist,
				'offline-cache',
				'offline cache',
				() => ($settings.offline = true)
			);
		} catch (e) {
			deleteOffline();
			fetchSpinner = false;
			return errorModal(e.message);
		}
	}

	async function fetchImages() {
		await caches.delete('image-cache');
		try {
			currentDownloadType = 'Offline images';
			if ('BackgroundFetchManager' in self) fetchSpinner = true;
			else {
				openModal({
					type: 'progress',
					data: [0, 0, 'Downloading offline images'],
					cancel: deleteImages
				});
			}
			// Fetch image list
			const res = await fetch(`/api/getImageList?trail=${$settings.trail}`);
			const list = await res.json();
			const URLlist = list.map((num) => `https://cdn.opentrail.org/img/${num}.jpg`);
			// Then fetch the tiles:
			await cacheFromList(
				URLlist,
				'image-cache',
				'offline images',
				() => ($settings.offlineimages = true)
			);
		} catch (e) {
			deleteImages();
			fetchSpinner = false;
			return errorModal(e.message);
		}
	}

	async function cacheFromList(URLlist, cachename, displayName, onSuccess) {
		if ('BackgroundFetchManager' in self) {
			//bgFetch for Chrome
			console.log('using bgFetch');
			const swReg = await navigator.serviceWorker.ready;
			let downloadTotal = URLlist.length * 100000; //images estimate
			if (cachename === 'offline-cache') downloadTotal = TRAILS[$settings.trail].sizeInBytes; //tiles estimate
			console.log(downloadTotal);
			const bgFetch = await swReg.backgroundFetch.fetch(cachename, URLlist, {
				title: 'Opentrail Offline',
				icons: [
					{
						src: '/android-192x192.png',
						sizes: '192x192',
						type: 'image/png'
					}
				],
				downloadTotal: downloadTotal
			});
			bgFetch.addEventListener('progress', () => {
				if (fetchSpinner) {
					fetchSpinner = false;
					$bgFetchStatus.spinner = true;
				}
				$bgFetchStatus.progress = Math.round(
					(bgFetch.downloaded / (URLlist.length * 150000)) * 100
				);
			});
			navigator.serviceWorker.onmessage = (event) => {
				if (event.data && event.data.type === 'BGFETCH_SUCCESS') {
					$bgFetchStatus.spinner = false;
					onSuccess();
				}
				if (event.data && event.data.type === 'BGFETCH_FAILURE') {
					$bgFetchStatus.spinner = false;
					errorModal('Failed to download offline cache');
				}
			};
			$modal.isOpen = false;
		} else {
			// foreground fetch fallback for iOS and Firefox:
			try {
				openModal({
					type: 'progress',
					data: [0, URLlist.length, `Downloading ${displayName}`],
					cancel: () => {
						limit.clearQueue();
						if (cachename === 'offline-cache') deleteOffline();
						if (cachename === 'image-cache') deleteImages();
						noSleep.disable();
					}
				});
				noSleep.enable();
				const cache = await caches.open(cachename);
				await Promise.all(
					URLlist.map((url) =>
						limit(async () => {
							await cache.add(url);
							$modal.data[0]++;
							// console.log(`${$modal.data[0]} of ${$modal.data[1]}: Successfully cached file ${tilestring}.pbf`);
							if ($modal.data[0] === $modal.data[1]) {
								$modal.isOpen = false;
								noSleep.disable();
								onSuccess();
							}
						})
					)
				);
			} catch (e) {
				limit.clearQueue();
				if (cachename === 'offline-cache') deleteOffline();
				if (cachename === 'image-cache') deleteImages();
				noSleep.disable();
				return errorModal(e.message);
			}
		}
	}

	async function syncDataWithSpinner() {
		syncSpinner = true;
		try {
			await syncData();
		} catch (e) {
			//cancel sync w error:
			syncSpinner = false;
			return errorModal(e.message);
		}
		updateStorageEstimate();
		syncSpinner = false;
	}

	async function deleteOffline() {
		try {
			await db.pending.clear();
			await caches.delete('offline-cache');
			await caches.delete('image-cache');
		} catch (e) {
			return errorModal(e.message);
		}
		$settings.offline = false;
		$settings.offlineimages = false;
	}

	async function deleteImages() {
		try {
			await caches.delete('image-cache');
		} catch (e) {
			return errorModal(e.message);
		}
		$settings.offlineimages = false;
	}
</script>

<div class="flex flex-col w-full p-4" bind:this={settingsWrapper}>
	{#each labels as [left, right, callback, subfield], i}
		{#if !subfield && i != 0}<div class="divider h-0 my-1" />{/if}
		<div
			class="flex flex-row justify-between items-center my-2 text-md cursor-pointer"
			on:click={callback}
		>
			<span class={subfield && 'ml-4'}>{left}</span>
			{#if typeof right === 'string'}
				<span class="truncate">
					{#if right === 'Sync' && syncSpinner}
						<button class="btn btn-square btn-ghost btn-sm loading -my-4" />
					{/if}
					{right} >
				</span>
			{:else if typeof right === 'boolean'}
				<div class="flex flex-row items-center">
					{#if left === currentDownloadType && $bgFetchStatus.spinner}
						<div
							class="radial-progress mx-4"
							style:--value={$bgFetchStatus.progress}
							style:--size="1.5rem"
						/>
					{:else if left === currentDownloadType && fetchSpinner}
						<button class="btn btn-square btn-ghost btn-sm loading -my-4" />
					{/if}
					<input type="checkbox" class="toggle block" bind:checked={right} />
				</div>
			{/if}
		</div>
	{/each}
</div>
