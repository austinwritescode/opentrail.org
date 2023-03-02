<script>
	import 'normalize.css';
	import '../app.css'; //tailwind
	import { fragment, modal, TRAILS, ICONS, settings, errorModal } from '$lib/store.js';
	import { onMount } from 'svelte';
	import WarnIcon from '$lib/warnIcon.svelte';
	import ErrorIcon from '$lib/errorIcon.svelte';
	import SuccessIcon from '$lib/successIcon.svelte';
	let spinner = false;
	let isInstalled = false;

	onMount(() => {
		//HACK: https://github.com/sveltejs/kit/issues/5693
		location.hash = ''; //todo: pick up deep links for marker sharing urls
		window.onhashchange = () => ($fragment = new URLSearchParams(location.hash.slice(1)));

		const iOSIsInstalled = window.navigator.standalone === true;
		const androidIsInstalled = window.matchMedia('(display-mode: standalone)').matches;
		isInstalled = iOSIsInstalled || androidIsInstalled;
	});

	function cancelModal() {
		$modal.isOpen = false;
		$modal.cancel();
	}
	async function submitModal() {
		try {
			if ($modal.type === 'editIcons' && $modal.data === '') return;
			if ($modal.type === 'text' && $modal.data[1] === '') return;
			if ($modal.type === 'textArea' && $modal.data[1] === '') return;
			if ($modal.spinner) spinner = true;
			$modal.isOpen = false;
			await $modal.submit($modal.data);
		} catch (e) {
			errorModal(e);
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

<div data-theme={$settings.dark ? 'dark' : 'light'} class="h-full w-full">
	<slot />
	<div
		class={'modal modal-bottom ' +
			($modal.type === 'editLoc' ? 'pointer-events-none bg-transparent' : 'sm:modal-middle')}
		class:modal-open={open}
		on:click|self={() => {
			if ($modal.type !== 'progress' && $modal.type !== 'editLoc') cancelModal();
		}}
	>
		<div class="modal-box pointer-events-auto space-y-4">
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
				<p>Contact: <a href="mailto:admin@opentrail.org">admin@opentrail.org</a></p>
				<p><a href="/terms.html">Terms of Use</a></p>
				<p><a href="/privacy.html">Privacy Policy</a></p>
				<!-- svelte-ignore missing-declaration -->
				<p>Version: {__VERSION__} {__LASTMOD__}</p>
			{:else if $modal.type === 'community'}
				<p class="text-lg">Marker moderation:</p>
				<ul class="list-disc list-inside text-sm">
					<li>
						Markers generally must be within 1 mile of the trail unless there is reason for a hiker
						to go off trail, such as a resupply point.
					</li>
					<li>One town marker per town, all services in that town must share that marker.</li>
					<li>No new marker within 200' of another.</li>
					<li>
						The red (!) icon is generally for hazardous conditions and otherwise critical
						information. Don't abuse it.
					</li>
					<li>
						Marker descriptions should contain general information only. If your information comes
						with a date (such as a water report) put it in a comment, not the description.
					</li>
					<li>
						Don't guesstimate the location of a marker, use your GPS location to place it precisely.
					</li>
				</ul>
				<p class="text-lg">General content:</p>
				<ul class="list-disc list-inside text-sm">
					<li>Rule #1: don't be an asshole.</li>
					<li>No illegal content. No copyright infringement. No spamming.</li>
					<li>
						No promotional content in comments. Advertising hiker-relevant services is acceptable
						only in marker descriptions when relevant, such as a town or road crossing. Any
						astroturfing or impersonation (such as leaving a fake hiker review) will result in your
						service never appearing on this map again.
					</li>
				</ul>
			{:else if $modal.type === 'editLoc'}
				<p class="font-bold text-xl">Select marker location</p>
			{:else if $modal.type === 'confirmFetch'}
				<p class="font-bold text-xl">Download {$modal.data[0]} now?</p>
				{#if !isInstalled}
					<div class="alert alert-warning shadow-lg mt-4">
						<div>
							<WarnIcon />
							<p>
								Installing the app to your home screen is strongly recommended to prevent data loss.
							</p>
						</div>
					</div>
				{/if}
				<p class="text-md my-4">Approximate size: {$modal.data[1]}</p>
			{:else if $modal.type === 'progress'}
				<p class="font-bold text-xl">{$modal.data[2]}</p>
				{#if $modal.data[1] > 0}
					<progress class="progress w-full" value={$modal.data[0]} max={$modal.data[1]} />
					<p class="text-md">{$modal.data[0]} of {$modal.data[1]}</p>
					<p>
						Do not turn off your screen or switch apps until complete. Your screen's sleep setting
						has been temporarily disabled until the download is complete.
					</p>
				{:else if $modal.data[1] === 0}
					<button class="btn btn-ghost btn-md loading -m-4" />
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
										<img src={`/${trail}_logo.png`} width="50" height="50" />
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
				<textarea class="textarea textarea-accent w-full my-4" bind:value={$modal.data[1]} />
			{:else if $modal.type === 'editIcons'}
				<p class="font-bold text-2xl">Marker icons</p>
				<div class="btn-group">
					{#each ICONS as icon}
						<button
							class="btn btn-circle btn-sm bg-white focus:bg-white active:bg-white border-opacity-50"
							class:opacity-40={!$modal.data.includes(icon)}
							on:click={() => {
								$modal.data.includes(icon)
									? ($modal.data = $modal.data.replace(icon, ''))
									: ($modal.data = $modal.data + icon);
							}}
						>
							<img src={`/map-icons/${icon}.png`} />
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
										on:click={() => {
											let tmp = $modal.data.replace(icon, '');
											$modal.data = icon + tmp;
										}}
									>
										<img src={`/map-icons/${icon}.png`} />
									</button>
								{/if}
							{/each}
						</div>
					</div>
				{/if}
			{:else if $modal.type === 'iOSCompass'}
				<p class="font-bold text-xl">Permission needed for compass</p>
			{/if}
			<div class="modal-action">
				{#if noConfirm}
					<button class="btn" on:click={cancelModal}>Dismiss</button>
				{:else}
					{#if !spinner}
						<button class="btn" on:click={cancelModal}>Cancel</button>
					{/if}
					{#if $modal.type !== 'progress'}
						{#if spinner}
							<button class="btn btn-primary loading">Confirm</button>
						{:else if $modal.type === 'iOSCompass'}
							<button class="btn btn-primary" on:click={$modal.submit}>Confirm</button>
						{:else}
							<button class="btn btn-primary" on:click={submitModal}>Confirm</button>
						{/if}
					{/if}
				{/if}
			</div>
		</div>
	</div>
</div>
