<script>
	import 'normalize.css';
	import '../app.css'; //tailwind
	import {
		modal,
		openModal,
		TRAILS,
		ICON_EXPLANATIONS,
		settings,
		handleError,
		isTransientError,
		isInstalled,
		deferredPrompt,
		platform,
		promptInstall,
		swWaitingRegistration,
		downloadState,
		downloadPersist
	} from '$lib/store.js';
	import DownloadOverlay from '$lib/DownloadOverlay.svelte';
	import { resumeDownload } from '$lib/download.js';
	import { onMount } from 'svelte';
	import * as Sentry from '@sentry/sveltekit';
	import WarnIcon from '$lib/warnIcon.svelte';
	import ErrorIcon from '$lib/errorIcon.svelte';
	import SuccessIcon from '$lib/successIcon.svelte';
	let spinner = false;

	onMount(() => {
		window.addEventListener('error', (e) => {
			handleError(e.error || new Error(e.message), { modal: true, sentry: true });
		});
		window.addEventListener('unhandledrejection', (e) => {
			const err = e.reason instanceof Error ? e.reason : new Error(String(e.reason));
			if (isTransientError(err)) {
				handleError(err, { modal: false, sentry: true, tags: { transient: true } });
			} else {
				handleError(err, { modal: true, sentry: true });
			}
		});

		window.addEventListener('beforeinstallprompt', (e) => {
			Sentry.metrics.count('client.install_prompted', 1);
			e.preventDefault();
			deferredPrompt.set(e);
		});
		window.addEventListener('appinstalled', () => {
			Sentry.metrics.count('client.app_installed', 1);
			deferredPrompt.set(null);
			isInstalled.set(true);
		});

		if ('serviceWorker' in navigator && window.isSecureContext) {
			navigator.serviceWorker.ready
				.then((reg) => {
					function showUpdateModal() {
						Sentry.metrics.count('client.sw.update_available', 1);
						swWaitingRegistration.set(reg);
						openModal({
							type: 'updateAvailable',
							submit: () => {
								Sentry.metrics.count('client.sw.update_installed', 1);
								reg.waiting.postMessage({ type: 'SKIP_WAITING' });
							},
							cancel: () => {}
						});
					}

					if (reg.waiting) showUpdateModal();

					reg.addEventListener('updatefound', () => {
						const newWorker = reg.installing;
						newWorker.addEventListener('statechange', () => {
							if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
								showUpdateModal();
							}
						});
					});
				})
				.catch(() => {});

			navigator.serviceWorker.addEventListener('controllerchange', () => {
				window.location.reload();
			});

			function maybeUpdateSW() {
				const last = localStorage.getItem('sw-last-check');
				if (!last || Date.now() - Number(last) > 86_400_000) {
					Sentry.metrics.count('client.sw.check_attempted', 1);
					navigator.serviceWorker
						?.getRegistration()
						?.then((r) => {
							r?.update()
								.then(() => localStorage.setItem('sw-last-check', String(Date.now())))
								.catch((e) => console.warn('SW update check failed:', e?.message));
						})
						.catch(() => {});
				}
			}

			maybeUpdateSW();
			document.addEventListener('visibilitychange', () => {
				Sentry.addBreadcrumb({
					category: 'lifecycle',
					message: `visibility: ${document.visibilityState}`
				});
				if (document.visibilityState === 'visible') maybeUpdateSW();
			});
		}

		resumeDownload();
	});

	function cancelModal() {
		$modal.isOpen = false;
		$modal.cancel();
	}
	async function submitModal() {
		try {
			if ($modal.type === 'editIcons' && $modal.data === '') return;
			if ($modal.type === 'text' && $modal.data[1] === '') return;
			if ($modal.spinner) spinner = true;
			$modal.isOpen = false;
			await $modal.submit($modal.data);
		} catch (e) {
			const err = e instanceof Error ? e : new Error(String(e));
			const transient = isTransientError(err);
			handleError(err, { modal: true, sentry: true, tags: transient ? { transient: true } : {} });
		} finally {
			spinner = false;
		}
	}
	$: open = $modal.isOpen || spinner;
	$: noConfirm =
		$modal.type === 'about' ||
		$modal.type === 'community' ||
		$modal.type === 'error' ||
		$modal.type === 'success' ||
		$modal.type === 'generic';
</script>

<div data-theme={$settings.dark ? 'dark' : 'light'} class="h-full w-full select-none flex flex-col">
	<DownloadOverlay />
	<div class="flex-1 min-h-0 overflow-auto">
		<slot />
	</div>
	<div
		class={'modal modal-bottom ' +
			($modal.type === 'editLoc' ? 'pointer-events-none bg-transparent' : 'sm:modal-middle')}
		class:modal-open={open}
		onclick={(e) => {
			if (e.target !== e.currentTarget) return;
			if ($modal.type !== 'editLoc' && $modal.type !== 'updateAvailable') cancelModal();
		}}
	>
		<div
			class="modal-box pointer-events-auto space-y-4"
			class:select-text={$modal.type === 'text' || $modal.type === 'textArea'}
		>
			{#if $modal.type === 'warning' || $modal.type === 'error' || $modal.type === 'success'}
				<!-- Ok this next part looks awful because daisy isn't smart enough to include the right class with `alert-${$modal.type}` -->
				<div
					class={'alert shadow-lg ' +
						($modal.type === 'warning'
							? 'alert-warning'
							: $modal.type === 'error'
								? 'alert-error'
								: $modal.type == 'success'
									? 'alert-success'
									: '')}
				>
					<div>
						{#if $modal.type === 'warning'}
							<WarnIcon />
						{:else if $modal.type === 'error'}
							<ErrorIcon />
						{:else if $modal.type === 'success'}
							<SuccessIcon />
						{/if}
						<p>{$modal.data}</p>
					</div>
				</div>
			{:else if $modal.type === 'generic'}
				<p class="text-lg">{$modal.data}</p>
			{:else if $modal.type === 'about'}
				<p class="italic">In wildness is the preservation of the world.</p>
				<p>
					<a href="https://github.com/austinwritescode/opentrail.org/issues" class="link">
						Bug reports
					</a>
				</p>
				<p><a href="https://cdn.opentrail.org/terms.html" class="link">Terms of Service</a></p>
				<p><a href="https://cdn.opentrail.org/privacy.html" class="link">Privacy Policy</a></p>
				<!-- svelte-ignore missing-declaration -->
				<p>Version: {__VERSION__} {__LASTMOD__}</p>
				<p>Contact: <a href="mailto:admin@opentrail.org">admin@opentrail.org</a></p>
				<p>
					Opentrail.org data is made available under the <a
						class="link"
						href="http://opendatacommons.org/licenses/odbl/1.0/">Open Database License</a
					>. Any rights in individual contents of the database are licensed under the
					<a class="link" href="http://opendatacommons.org/licenses/dbcl/1.0/"
						>Database Contents License</a
					>
				</p>
			{:else if $modal.type === 'community'}
				<p>
					This map is a communal effort, think of it as a hiker's Wikipedia. If you see any missing
					information please add it and if you see any wrong information please correct it! All
					contributions are greatly appreciated.
				</p>
				<p class="text-lg">Marker moderation:</p>
				<ul class="list-disc list-inside text-sm">
					<li>Marker icon descriptions:</li>
					{#each ICONS as icon}<li>
							<img
								src={`https://cdn.opentrail.org/icons/${icon}.png`}
								height="25"
								width="25"
								class="inline"
							/>{ICON_EXPLANATIONS[icon]}
						</li>{/each}
					<li>
						Markers generally must be within 1 mile of the trail unless there is reason for a hiker
						to go off trail, such as a resupply point.
					</li>
					<li>
						Marker descriptions should contain general information only. If your information comes
						with a date (such as a water report) put it in a comment, not the description, so newer
						information can go above it.
					</li>
				</ul>
				<p class="text-lg">General content:</p>
				<ul class="list-disc list-inside text-sm">
					<li>Rule #1: don't be an asshole.</li>
					<li>No illegal content. No copyright infringement. No spamming.</li>
					<li>
						You may advertise a hiker-relevant service with a single marker, generally with the town
						icon. Shuttles may put their information in the description for a road crossing. No
						promotional content is allowed in comments. Impersonators will be permanently banned.
					</li>
				</ul>
			{:else if $modal.type === 'editLoc'}
				<p class="font-bold text-xl">Select marker location</p>
			{:else if $modal.type === 'confirmFetch'}
				{#if !$isInstalled && window.location.hostname !== 'localhost'}
					<p class="font-bold text-xl">Install required</p>
					<p class="mt-2">
						Install this app to your home screen to enable {$modal.data[0]}. This protects your
						downloaded data from being deleted by the browser.
					</p>
					{#if $deferredPrompt}
						<p class="text-sm opacity-70 mt-2">Tap Install below, then confirm the download.</p>
					{:else if $platform === 'ios-safari'}
						<div class="bg-base-200 rounded-lg p-4 mt-4 space-y-3 select-none">
							<div class="flex items-center gap-3">
								<span
									class="flex-none w-7 h-7 rounded-full bg-primary text-primary-content flex items-center justify-center font-bold"
									>1</span
								>
								<p>
									Tap the <strong>Share</strong> button
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-5 w-5 inline"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										stroke-width="2"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M12 16V4m0 0L8 8m4-4l4 4M4 14v4a2 2 0 002 2h12a2 2 0 002-2v-4"
										/>
									</svg>
								</p>
							</div>
							<div class="flex items-center gap-3">
								<span
									class="flex-none w-7 h-7 rounded-full bg-primary text-primary-content flex items-center justify-center font-bold"
									>2</span
								>
								<p>Scroll down and tap <strong>Add to Home Screen</strong></p>
							</div>
							<div class="flex items-center gap-3">
								<span
									class="flex-none w-7 h-7 rounded-full bg-primary text-primary-content flex items-center justify-center font-bold"
									>3</span
								>
								<p>Tap <strong>Add</strong>, then open the app from your home screen</p>
							</div>
						</div>
					{:else}
						<p class="text-sm opacity-70 mt-2">
							Use <strong>Safari on iOS</strong> or <strong>Chrome on Android</strong> to install
							this app.
						</p>
					{/if}
				{:else}
					<p class="font-bold text-xl">Download {$modal.data[0]} now?</p>
					<p class="text-md my-4">Size: {$modal.data[1]}</p>
				{/if}
			{:else if $modal.type === 'trail'}
				<p class="font-bold text-2xl">Trail Selection</p>
				<div class="flex flex-col pl-4">
					{#if window.location.hostname.split('.')[0] === 'test'}
						<label for="test">
							<div class="flex items-center gap-2">
								<input
									type="radio"
									name="trails"
									id="test"
									class="radio radio-secondary"
									bind:group={$modal.data}
									value="test"
								/>
								<WarnIcon />
								<span class="text-xl">test</span>
							</div>
						</label>
					{:else}
						{#each Object.keys(TRAILS) as trail}
							{#if trail !== 'test'}
								<label for={trail}>
									<div class="flex items-center gap-2">
										<input
											type="radio"
											name="trails"
											id={trail}
											class="radio radio-secondary"
											bind:group={$modal.data}
											value={trail}
										/>
										<img
											src={`https://cdn.opentrail.org/${trail}_logo.png`}
											width="50"
											height="50"
										/>
										<span class="text-xl">{trail}</span>
									</div>
								</label>
							{/if}
						{/each}
					{/if}
				</div>
			{:else if $modal.type === 'text'}
				<p class="font-bold text-2xl">{$modal.data[0]}</p>
				<input
					class="input input-bordered input-accent w-full my-4"
					type="text"
					bind:value={$modal.data[1]}
				/>
			{:else if $modal.type === 'textArea'}
				<p class="font-bold text-2xl">{$modal.data[0]}</p>
				<textarea class="textarea textarea-accent w-full my-4" bind:value={$modal.data[1]}
				></textarea>
			{:else if $modal.type === 'textAreaWithComment'}
				<p class="font-bold text-2xl">{$modal.data[0]}</p>
				<textarea class="textarea textarea-accent w-full my-2" bind:value={$modal.data[1]}
				></textarea>
				<p class="text-sm opacity-50 mb-2">For permanent features of the marker</p>
				<p class="font-bold text-lg mt-2">
					First comment <span class="font-normal text-sm opacity-50">(optional)</span>
				</p>
				<textarea class="textarea textarea-accent w-full my-2" bind:value={$modal.data[2]}
				></textarea>
				<p class="text-sm opacity-50 mb-4">For aspects you want date-associated</p>
			{:else if $modal.type === 'editIcons'}
				<p class="font-bold text-2xl">Marker icons</p>
				<div class="btn-group">
					{#each ICONS as icon}
						<button
							class="btn btn-circle btn-sm bg-white focus:bg-white active:bg-white border-opacity-50"
							class:opacity-40={!$modal.data.includes(icon)}
							onclick={() => {
								$modal.data.includes(icon)
									? ($modal.data = $modal.data.replace(icon, ''))
									: ($modal.data = $modal.data + icon);
							}}
						>
							<img src={`https://cdn.opentrail.org/icons/${icon}.png`} />
						</button>
					{/each}
				</div>
				{#if $modal.data.length > 1}
					<div>
						<p>Select one to be the map marker:</p>
						<div class="btn-group">
							{#each ICONS as icon}
								{#if $modal.data.includes(icon)}
									<button
										class="btn btn-circle btn-sm bg-white focus:bg-white active:bg-white border-opacity-50"
										class:opacity-40={$modal.data[0] !== icon}
										onclick={() => {
											let tmp = $modal.data.replace(icon, '');
											$modal.data = icon + tmp;
										}}
									>
										<img src={`https://cdn.opentrail.org/icons/${icon}.png`} />
									</button>
								{/if}
							{/each}
						</div>
					</div>
				{/if}
			{:else if $modal.type === 'iOSCompass'}
				<p class="font-bold text-xl">Enable compass heading?</p>
				<p class="text-sm opacity-70">You'll be asked to allow motion access.</p>
			{:else if $modal.type === 'updateAvailable'}
				<p class="font-bold text-xl">Update available</p>
				<p class="text-sm opacity-70">
					A new version of OpenTrail is ready. Updating will restart the app.
				</p>
			{/if}
			<div class="modal-action">
				{#if noConfirm}
					<button class="btn" onclick={cancelModal}>Dismiss</button>
				{:else if $modal.type === 'confirmFetch' && !$isInstalled && window.location.hostname !== 'localhost'}
					{#if $deferredPrompt}
						<button class="btn" onclick={cancelModal}>Cancel</button>
						<button class="btn btn-primary" onclick={promptInstall}>Install</button>
					{:else}
						<button class="btn" onclick={cancelModal}>Dismiss</button>
					{/if}
				{:else}
					{#if !spinner}
						<button class="btn" onclick={cancelModal}>Cancel</button>
					{/if}
					{#if spinner}
						<button class="btn btn-primary loading">Confirm</button>
					{:else if $modal.type === 'iOSCompass'}
						<button class="btn btn-primary" onclick={$modal.submit}>Confirm</button>
					{:else if $modal.type === 'updateAvailable'}
						<button class="btn btn-primary" onclick={submitModal}>Update now</button>
					{:else}
						<button class="btn btn-primary" onclick={submitModal}>Confirm</button>
					{/if}
				{/if}
			</div>
		</div>
	</div>
</div>
