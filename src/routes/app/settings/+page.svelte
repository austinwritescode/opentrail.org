<script>
	let installHelp = false;
	import Icon from '$lib/Icon.svelte';
	import { db } from '$lib/db';
	import { getData, syncData } from '$lib/api.js';
	import { liveQuery } from 'dexie';
	import { browser, dev } from '$app/environment';
	import { goto } from '$app/navigation';
	import {
		settings,
		openModal,
		handleError,
		modal,
		downloadState,
		downloadPersist,
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
	import * as Sentry from '@sentry/sveltekit';
	dayjs.extend(relativeTime);
	import prettyBytes from 'pretty-bytes';
	import { hold, unhold } from '$lib/wakeLock.js';
	import { streamPmtiles, deleteOffline, getOPFSFileSize } from '$lib/download.js';

	const groups = [
		{ heading: 'YOUR TRAIL', keys: ['Trail', 'Direction'] },
		{
			heading: 'OFFLINE & SYNC',
			keys: [
				'Offline cache',
				'Last sync:',
				'Automatic sync',
				'Pending uploads:',
				'Install app',
				'An update is available'
			]
		},
		{
			heading: 'PREFERENCES',
			keys: ['Username', 'Dark mode', 'Units', 'Date format', 'Send crash reports']
		},
		{ heading: 'ABOUT OPENTRAIL', keys: ['Community guidelines', 'About', 'Reset app'] }
	];
	let syncSpinner = false;
	let opfsSizeLabel = '';

	onMount(updateStorageEstimate);
	$: if ($settings.offline || $settings.trail) updateStorageEstimate();
	async function updateStorageEstimate() {
		const opfsSize = await getOPFSFileSize($settings.trail);
		opfsSizeLabel = opfsSize > 0 ? ` (${prettyBytes(opfsSize)})` : '';
	}

	function toggle(key) {
		$settings[key] = !$settings[key];
	}
	function toggleUnits() {
		$settings.units = $settings.units === 'imperial' ? 'metric' : 'imperial';
	}
	function toggleDateFormat() {
		$settings.dateFormat = $settings.dateFormat === 'M/D/YYYY' ? 'D/M/YYYY' : 'M/D/YYYY';
	}
	async function changeTrail(newTrail) {
		await deleteOffline();
		$settings.trail = newTrail;
		await getData();
		await goto('/app');
	}

	let pendingCount = liveQuery(() => (browser ? db.pending.count() : 0));
	$: pendingSublabel =
		$pendingCount > 0 ? [['Pending uploads: ' + $pendingCount, null, null, true]] : [];
	$: offlineSublabels = $settings.offline
		? [
				...pendingSublabel,
				['Last sync: ' + $settings.lastsync.fromNow(), 'Sync', syncDataWithSpinner, true],
				['Automatic sync', $settings.autosync, toggleAutosync, true]
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
		['Offline cache' + opfsSizeLabel, $settings.offline, toggleOffline, false],
		...offlineSublabels,
		['Username', $settings.username, openUsernameModal, false],
		['Dark mode', $settings.dark, () => toggle('dark'), false],
		['Units', $settings.units === 'imperial' ? 'mi/ft' : 'km/m', toggleUnits, false],
		['Date format', $settings.dateFormat.replace('YYYY', 'Y'), toggleDateFormat, false],
		['Send crash reports', $settings.sendCrashReports, () => toggle('sendCrashReports'), false],
		['Reset app', '', openResetModal, false],
		['Community guidelines', '', () => openModal({ type: 'community' }), false],
		['About', '', () => openModal({ type: 'about' }), false]
	].map(([left, right, callback, subfield]) => ({
		left: String(left),
		right,
		callback,
		subfield: Boolean(subfield)
	}));
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

	async function toggleOffline() {
		if ($settings.offline)
			openModal({
				type: 'warning',
				data: "This will delete your offline cache and pending uploads. It can't be undone.",
				submit: deleteOffline
			});
		else {
			let sizeLabel = 'unknown size';
			try {
				const res = await fetch(`https://cdn.opentrail.org/${$settings.trail}.pmtiles`, {
					method: 'HEAD',
					cache: 'no-store'
				});
				const len = res.headers.get('Content-Length');
				if (len) sizeLabel = prettyBytes(parseInt(len));
			} catch {}
			openModal({
				type: 'confirmFetch',
				data: ['offline cache', sizeLabel],
				submit: fetchOffline
			});
		}
	}

	function installUpdate() {
		const reg = $swWaitingRegistration;
		if (reg && reg.waiting) {
			reg.waiting.postMessage({ type: 'SKIP_WAITING' });
			swWaitingRegistration.set(null);
		}
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

	async function getMissingAssets() {
		if (!window.isSecureContext || typeof caches === 'undefined') return [];
		const reg = await navigator.serviceWorker.ready;
		return new Promise((resolve, reject) => {
			const channel = new MessageChannel();
			const timeout = setTimeout(() => reject(new Error('Cache verification timed out')), 5000);
			channel.port1.onmessage = (e) => {
				clearTimeout(timeout);
				resolve(e.data.missing);
			};
			channel.port1.onmessageerror = () => {
				clearTimeout(timeout);
				reject(new Error('Cache verification failed'));
			};
			reg.active.postMessage({ type: 'VERIFY_CACHE' }, [channel.port2]);
		});
	}

	async function fetchOffline() {
		if (typeof caches === 'undefined')
			return handleError(new Error('Caches API not available. Ensure you are using HTTPS.'), {
				modal: true,
				sentry: true,
				tags: { transient: true }
			});
		if (!navigator.serviceWorker.controller)
			return handleError(
				new Error(
					"Offline mode isn't available. This can happen when device storage is low or the page wasn't loaded securely. Try freeing up storage, ensure you're on HTTPS, and reload the page."
				),
				{ modal: true, sentry: true, tags: { transient: true } }
			);
		const isLocalhost = window.location.hostname === 'localhost';
		if (!$isInstalled && !isLocalhost)
			return handleError(
				new Error(
					'Install this app to your home screen to enable offline mode. This ensures your cached data will not be evicted by the browser.'
				),
				{ modal: true, sentry: true, tags: { transient: true } }
			);
		if (!isLocalhost) {
			const persisted = await navigator.storage.persist();
			Sentry.metrics.count('client.storage.persist_requested', 1);
			if (!persisted) {
				Sentry.metrics.count('client.storage.persist_failed', 1);
				return handleError(
					new Error(
						'Could not secure persistent storage. Make sure the app is installed to your home screen and try again.'
					),
					{ modal: true, sentry: true, tags: { transient: true } }
				);
			}
		}

		let missing;
		try {
			missing = await getMissingAssets();
		} catch (e) {
			return handleError(
				new Error('Could not verify cached assets. Refresh the page and try again.'),
				{ modal: true, sentry: true, tags: { transient: true } }
			);
		}
		if (missing.length > 0) {
			const cacheName = (await caches.keys()).find((k) => k.startsWith('cache-'));
			if (!cacheName)
				return handleError(new Error('No app cache found. Refresh the page and try again.'), {
					modal: true,
					sentry: true,
					tags: { transient: true }
				});
			const cache = await caches.open(cacheName);
			const results = await Promise.allSettled(
				missing.map((url) =>
					fetch(url).then((res) => {
						if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
						return cache.put(url, res);
					})
				)
			);
			const failed = results.filter((r) => r.status === 'rejected');
			if (failed.length > 0) {
				const stillMissing = await getMissingAssets();
				if (stillMissing.length > 0)
					return handleError(
						new Error(
							`Could not cache ${stillMissing.length} essential asset(s). Check your connection and try again.`
						),
						{ modal: true, sentry: true }
					);
			}
		}

		await caches.delete('offline-cache');
		const cache = await caches.open('offline-cache');
		hold();
		try {
			$downloadPersist = {
				type: 'offline-cache',
				trail: $settings.trail,
				status: 'in_progress',
				bytesReceived: 0,
				totalBytes: 0
			};
			const trailData = [
				`https://cdn.opentrail.org/${$settings.trail}.json`,
				`/api/getData?trail=${$settings.trail}`
			];
			await cache.addAll(trailData);
			await streamPmtiles($settings.trail, 0, 0, 'Downloading offline cache');
			await fetchImages();
			$settings.offline = true;
		} catch (e) {
			deleteOffline();
			if (e?.name !== 'AbortError') {
				return handleError(/** @type {Error} */ (e), { modal: true, sentry: true });
			}
		} finally {
			unhold();
		}
	}

	async function fetchImages() {
		if (typeof caches === 'undefined')
			throw new Error('Caches API not available. Ensure you are using HTTPS.');
		await caches.delete('image-cache');
		$downloadPersist = {
			type: 'image-cache',
			trail: $settings.trail,
			status: 'in_progress',
			bytesReceived: 0,
			totalBytes: 0
		};
		$downloadState = {
			active: true,
			type: 'image-cache',
			displayName: 'Downloading offline images',
			downloaded: 0,
			total: 0,
			trail: $settings.trail,
			onCancel: () => {
				limit.clearQueue();
			}
		};
		const res = await fetch(`/api/getImageList?trail=${$settings.trail}`);
		const list = await res.json();
		const URLlist = list.map(
			(/** @type {number} */ num) => `https://cdn.opentrail.org/img/${num}.jpg`
		);
		await cacheFromList(URLlist, 'image-cache', 'offline images');
	}

	async function cacheFromList(URLlist, cachename, displayName) {
		if (typeof caches === 'undefined')
			throw new Error('Caches API not available. Ensure you are using HTTPS.');
		if (URLlist.length === 0) {
			$downloadState.active = false;
			$downloadPersist.status = 'complete';
			return;
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
						}
					})
				)
			);
		} catch (e) {
			limit.clearQueue();
			throw e;
		}
	}

	async function syncDataWithSpinner() {
		syncSpinner = true;
		try {
			await syncData();
		} catch (e) {
			//cancel sync w error:
			syncSpinner = false;
			return handleError(/** @type {Error} */ (e), { modal: true, sentry: true });
		}
		updateStorageEstimate();
		syncSpinner = false;
	}

	function openResetModal() {
		openModal({
			type: 'warning',
			data: 'This will reset the app to a clean state. Your settings, offline cache, and pending uploads will be preserved.',
			submit: resetApp
		});
	}
	function resetApp() {
		Sentry.metrics.count('client.reset_app', 1);
		localStorage.removeItem('downloadPersist');
		localStorage.removeItem('sw-last-check');
		setTimeout(() => window.location.reload(), 50);
	}
</script>

<svelte:head><title>Settings &middot; OpenTrail</title></svelte:head>
<main class="settings-page">
	<h1>Settings</h1>
	{#each groups as { heading, keys }}
		<section class="settings-section">
			<h2>{heading}</h2>
			<div class="settings-card">
				{#each labels.filter( (row) => keys.some( (key) => row.left.startsWith(key) ) ) as { left, right, callback, subfield }}
					{#if left === 'Direction'}
						<div class="direction-setting">
							<span id="travel-direction">Direction of travel</span>
							<div class="direction-options" role="group" aria-labelledby="travel-direction">
								<button
									aria-pressed={!$settings.reverseMiles}
									onclick={() => {
										$settings.reverseMiles = false;
									}}>Northbound</button
								>
								<button
									aria-pressed={$settings.reverseMiles}
									onclick={() => {
										$settings.reverseMiles = true;
									}}>Southbound</button
								>
							</div>
						</div>
					{:else if left === 'Install app'}
						<button
							aria-expanded={$deferredPrompt ? undefined : installHelp}
							class="setting-row install-setting"
							onclick={() => {
								if ($deferredPrompt) promptInstall();
								else installHelp = !installHelp;
							}}
						>
							<span class="install-symbol"><Icon name="download" size={20} /></span>
							<span class="install-copy"
								><strong>Install app</strong><span>For offline maps and all features</span></span
							><Icon name="chevron" size={20} />
						</button>
						{#if installHelp}<p class="settings-install-help" role="status">{right}</p>{/if}
					{:else}
						<button
							class="setting-row"
							class:subfield
							onclick={() => {
								if (typeof callback === 'function') callback();
							}}
							aria-pressed={typeof right === 'boolean' ? right : undefined}
						>
							<span>{left}</span>
							{#if typeof right === 'boolean'}<span
									class="toggle"
									class:toggle-active={right}
									style:background-color={right ? '#0E3B32' : 'transparent'}
									aria-hidden="true"><span></span></span
								>
							{:else}<span class="setting-value"
									>{right === 'Sync' && syncSpinner ? 'Syncing...' : right}<Icon
										name="chevron"
										size={16}
									/></span
								>{/if}
						</button>
					{/if}
				{/each}
			</div>
		</section>
	{/each}
	<footer class="settings-brand">
		<img src="/brand/signpost-forest.svg" alt="" width="24" height="24" />OpenTrail &middot; Made
		for the trail community
	</footer>
</main>
