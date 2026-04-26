<script>
	import { goto } from '$app/navigation';
	import {
		settings,
		TRAILS,
		isInstalled,
		deferredPrompt,
		platform,
		promptInstall
	} from '$lib/store.js';
	import { onMount } from 'svelte';

	let showTrails = false;

	onMount(() => {
		if (window.location.hostname.split('.')[0] === 'test') goto('/app');
		if ($isInstalled || $settings.trail) showTrails = true;
	});

	function handleInstall() {
		promptInstall();
	}

	function skipInstall() {
		showTrails = true;
	}

	$: if ($isInstalled && !showTrails) showTrails = true;
</script>

<div class="p-4 flex flex-col items-center gap-1 h-full overflow-y-auto">
	<img src="/apple-touch-icon.png" class="mask mask-squircle mt-4" height="128" width="128" />
	<p class="text-4xl mt-2">OpenTrail.org</p>
	<p class="text-lg opacity-70">
		A free offline trail map with recent hiker comments and waypoints
	</p>

	{#if !showTrails}
		<div class="flex flex-col items-center w-full max-w-sm mt-4 gap-3">
			{#if $platform === 'ios-safari'}
				<div class="w-full bg-base-200 rounded-lg p-4 space-y-4">
					<p class="font-bold text-lg text-center">Install OpenTrail on your Home Screen</p>
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
									d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
								/>
							</svg>
							at the bottom of Safari
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
						<p>Tap <strong>Add</strong> in the top right</p>
					</div>
				</div>
				<p class="text-sm opacity-60 text-center">
					Installing gives you offline maps, faster loading, and a full-screen experience.
				</p>
			{:else if $deferredPrompt}
				<button class="btn btn-primary btn-lg w-full" on:click={handleInstall}>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-6 w-6 mr-2"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
						/>
					</svg>
					Install App
				</button>
				<p class="text-sm opacity-60 text-center">
					Install for offline maps, faster loading, and a full-screen experience.
				</p>
			{:else}
				<div class="w-full bg-base-200 rounded-lg p-4">
					<p class="font-bold text-lg text-center mb-2">Install OpenTrail</p>
					{#if $platform === 'android-chrome'}
						<p class="text-center">
							Tap <strong>&#8942;</strong> in the top right, then tap
							<strong>Install app</strong>
						</p>
					{:else}
						<p class="text-center">
							Look for <strong>Install app</strong> or <strong>Add to Home Screen</strong> in your
							browser's menu
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4 w-4 inline"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
								/>
							</svg>
						</p>
					{/if}
				</div>
				<p class="text-sm opacity-60 text-center">
					Installing gives you offline maps, faster loading, and a full-screen experience.
				</p>
			{/if}

			<button class="btn btn-ghost btn-sm mt-2" on:click={skipInstall}>Not now</button>
		</div>
	{/if}

	{#if showTrails}
		<div class="flex flex-col items-center w-full mt-4">
			{#if $settings.trail !== '' && $settings.offline}
				<p class="text-xl">You have enabled offline mode for this trail:</p>
			{:else}
				<p class="text-xl">Select a trail to begin</p>
			{/if}
			<p class="text-md mb-4 opacity-70">(This can be changed later in settings)</p>
			<div class="flex gap-4 flex-wrap justify-center">
				{#each Object.keys(TRAILS) as trail}
					{#if trail !== 'test'}
						{#if !$settings.offline || $settings.trail === trail}
							<a
								class="flex flex-col items-center gap-1"
								href="/app"
								on:click={() => {
									$settings.trail = trail;
								}}
							>
								<img src={`${trail}_logo.png`} width="100" height="100" />
								<button class="btn btn-accent btn-lg">{trail}</button>
							</a>
						{/if}
					{/if}
				{/each}
			</div>
		</div>

		<p class="text-md mt-6 opacity-50">
			Data contributions are open for public use under the
			<a class="link" href="https://opendatacommons.org/licenses/odbl/summary/">
				Open Database License
			</a>
		</p>
	{/if}
</div>

<style>
	p {
		text-align: center;
	}
</style>
