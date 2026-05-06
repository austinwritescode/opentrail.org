<script>
	import { db } from '$lib/db';
	import { getData, syncData } from '$lib/api.js';
	import { liveQuery } from 'dexie';
	import { browser, dev } from '$app/environment';
	import { goto } from '$app/navigation';
	import {
		settings,
		openModal,
		errorModal,
		modal,
		downloadState,
		downloadPersist,
		TRAILS,
		isInstalled,
		deferredPrompt,
		platform,
		promptInstall,
		swWaitingRegistration
	} from '$lib/store.js';
import pLimit from 'p-limit';
const limit = pLimit(5);
import { onMount } from 'svelte';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);
import prettyBytes from 'pretty-bytes';
import NoSleep from 'nosleep.js';
import { streamPmtiles, deleteOffline, deleteImages } from '$lib/download.js';
/** @type {import('nosleep.js').default | undefined} */
var noSleep;
if (browser) noSleep = new NoSleep();

	let syncSpinner = false;
	let storageEstimate = '';

	onMount(updateStorageEstimate);
	$: if ($settings.offline) updateStorageEstimate();
	async function updateStorageEstimate() {
		if (navigator?.storage?.estimate) {
			const estimate = await navigator.storage.estimate();
			storageEstimate = `${prettyBytes(estimate.usage)} (${prettyBytes(estimate.quota)} available)`;
		}
	}

	function toggle(key) {
		$settings[key] = !$settings[key];
	}
	function toggleUnits() {
		$settings.units = $settings.units === 'imperial' ? 'metric' : 'imperial';
	}
	let settingsWrapper;
	async function changeTrail(newTrail) {
		$settings.trail = newTrail;
		deleteOffline();
		await getData();
		const event = new CustomEvent('repopulateMap', { bubbles: true });
		settingsWrapper?.dispatchEvent(event);
		await goto('/app');
	}

	let pendingCount = liveQuery(() => (browser ? db.pending.count() : 0));
	$: pendingSublabel =
		$pendingCount > 0 ? [['Pending uploads: ' + $pendingCount, null, null, true]] : [];
	$: offlineSublabels = $settings.offline
		? [
				...(storageEstimate ? [[`Size: ${storageEstimate}`, null, null, true]] : []),
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
		...(!$isInstalled
			? [
					[
						'Install app',
						$deferredPrompt
							? 'Install'
							: $platform === 'ios-safari'
							? 'Safari → Share → Add to Home Screen'
							: 'Use Safari on iOS or Chrome on Android',
						$deferredPrompt ? promptInstall : () => {},
						false
					]
			  ]
			: []),
		...($swWaitingRegistration
			? [['An update is available', 'Install now', installUpdate, false]]
			: []),
		['Offline cache', $settings.offline, toggleOffline, false],
		...offlineSublabels,
		['Username', $settings.username, openUsernameModal, false],
		['Dark mode', $settings.dark, () => toggle('dark'), false],
		['Units', $settings.units === 'imperial' ? 'mi/ft' : 'km/m', toggleUnits, false],
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
						data: "This will delete your offline cache and pending uploads. It can't be undone.",
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
				data: "This will delete your offline cache and pending uploads. It can't be undone.",
				submit: deleteOffline
			});
		else
			openModal({
				type: 'confirmFetch',
				data: ['offline cache', TRAILS[$settings.trail].size],
				submit: fetchOffline
			});
	}

	function installUpdate() {
		const reg = $swWaitingRegistration;
		if (reg && reg.waiting) {
			reg.waiting.postMessage({ type: 'SKIP_WAITING' });
			swWaitingRegistration.set(null);
		}
	}

	function toggleImages() {
		if ($settings.offlineimages)
			openModal({
				type: 'warning',
				data: "This will delete your offline cache and pending uploads. It can't be undone.",
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

	async function fetchOffline() {
		if (!navigator.serviceWorker)
			return errorModal('No service worker found. Refresh the page and try again.');
		if (!navigator.serviceWorker.controller && !dev)
			return errorModal('Service worker not ready. Refresh the page and try again.');
		const persisted = await navigator.storage.persist();
		if (!persisted)
			return errorModal(
				'No persistent storage found. Check your browser permissions. If your phone is out of date it may not support persistent storage.'
			);

		await caches.delete('offline-cache');
		const cache = await caches.open('offline-cache');
		try {
			$downloadPersist = { type: 'offline-cache', trail: $settings.trail, status: 'in_progress', bytesReceived: 0, totalBytes: 0 };
			const trailData = [
				`https://cdn.opentrail.org/${$settings.trail}.json`,
				`/api/getData?trail=${$settings.trail}`
			];
			await cache.addAll(trailData);
			await streamPmtiles(
				$settings.trail,
				0,
				0,
				'Downloading offline cache',
				() => { $settings.offline = true; },
				deleteOffline
			);
		} catch (e) {
		deleteOffline();
		noSleep?.disable();
		return errorModal(/** @type {Error} */ (e).message);
	}
}

async function fetchImages() {
	await caches.delete('image-cache');
	try {
		$downloadPersist = { type: 'image-cache', trail: $settings.trail, status: 'in_progress', bytesReceived: 0, totalBytes: 0 };
		$downloadState = {
			active: true,
			type: 'image-cache',
			displayName: 'Downloading offline images',
			downloaded: 0,
			total: 0,
			trail: $settings.trail,
			onCancel: () => {
				limit.clearQueue();
				deleteImages();
				noSleep?.disable();
			}
		};
		noSleep?.enable();
		const res = await fetch(`/api/getImageList?trail=${$settings.trail}`);
		const list = await res.json();
		const URLlist = list.map((/** @type {number} */ num) => `https://cdn.opentrail.org/img/${num}.jpg`);
		await cacheFromList(URLlist, 'image-cache', 'offline images', () => {
			$settings.offlineimages = true;
		});
	} catch (e) {
		deleteImages();
		noSleep?.disable();
		return errorModal(/** @type {Error} */ (e).message);
	}
}

async function cacheFromList(URLlist, cachename, displayName, onSuccess) {
	if (URLlist.length === 0) {
		$downloadState.active = false;
		$downloadPersist.status = 'complete';
		noSleep?.disable();
		return onSuccess();
	}
	try {
		$downloadState.downloaded = 0;
		$downloadState.total = URLlist.length;
		const cache = await caches.open(cachename);
		await Promise.all(
			URLlist.map((url) =>
				limit(async () => {
					await cache.add(url);
					$downloadState.downloaded++;
					if ($downloadState.downloaded === $downloadState.total) {
						$downloadState.active = false;
						$downloadPersist.status = 'complete';
						noSleep?.disable();
						onSuccess();
					}
				})
			)
		);
	} catch (e) {
		limit.clearQueue();
		if (cachename === 'offline-cache') deleteOffline();
		if (cachename === 'image-cache') deleteImages();
		noSleep?.disable();
		return errorModal(/** @type {Error} */ (e).message);
	}
}

	async function syncDataWithSpinner() {
		syncSpinner = true;
		try {
			await syncData();
		} catch (e) {
			//cancel sync w error:
			syncSpinner = false;
			return errorModal(/** @type {Error} */ (e).message);
		}
		updateStorageEstimate();
		syncSpinner = false;
	}
	</script>

<div class="flex flex-col w-full p-4" bind:this={settingsWrapper}>
	{#each labels as [left, right, callback, subfield], i}
		{#if !subfield && i != 0}<div class="divider h-0 my-1"></div>{/if}
		<div
			class="flex flex-row justify-between items-center my-2 text-md cursor-pointer"
			onclick={() => { if (typeof callback === 'function') callback(); }}
		>
			<span class={subfield && 'ml-4'}>{left}</span>
			{#if typeof right === 'string'}
				<span class="truncate">
					{#if right === 'Sync' && syncSpinner}
						<button class="btn btn-square btn-ghost btn-sm loading -my-4"></button>
					{/if}
					{right} >
				</span>
			{:else if typeof right === 'boolean'}
				<input type="checkbox" class="toggle block" bind:checked={right} />
			{/if}
		</div>
	{/each}
</div>
