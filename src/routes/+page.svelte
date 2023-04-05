<script>
	import { goto } from '$app/navigation';
	import { settings, TRAILS } from '$lib/store.js';
	import { onMount } from 'svelte';

	onMount(() => {
		if (window.location.hostname.split('.')[0] === 'test') goto('/app');
	});
</script>

<div class="p-4 flex flex-col items-center gap-1">
	<img src="/apple-touch-icon.png" class="mask mask-squircle" height="180" width="180" />
	<p class="text-4xl">OpenTrail.org</p>
	<p class="text-2xl">A free trail info community</p>
	<p class="text-md mb-6 opacity-70">
		Data contributions are open for public use under the
		<a class="link" href="https://opendatacommons.org/licenses/odbl/summary/">
			Open Database License
		</a>
	</p>
	{#if $settings.trail !== '' && $settings.offline}
		<p class="text-2xl">You have enabled offline mode for this trail:</p>
	{:else}
		<p class="text-2xl">To begin, select a trail</p>
	{/if}
	<p class="text-md mb-4 opacity-70">(This can be changed later in the settings)</p>
	<div class="flex gap-4">
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

<style>
	p {
		text-align: center;
	}
</style>
