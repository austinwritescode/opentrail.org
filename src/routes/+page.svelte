<script>
	import { goto } from '$app/navigation';
	import { settings, TRAILS } from '$lib/store.js';
	import { onMount } from 'svelte';

	onMount(() => {
		if ($settings.trail !== '') goto('/app');
	});
</script>

<div class="p-4 flex flex-col items-center gap-1">
	<img src="/apple-touch-icon.png" class="mask mask-squircle" height="180" width="180" />
	<p class="text-4xl text-primary-content">Welcome to opentrail.org</p>
	<p class="text-md mb-8">A free and open trail info community</p>
	<p class="text-2xl text-primary-content">To begin, select a trail</p>
	<p class="text-md mb-4">(This can be changed at any time under settings)</p>
	<div class="flex gap-4">
		{#each Object.keys(TRAILS) as trail}
			{#if trail !== 'test'}
				<a
					class="flex flex-col items-center gap-1"
					href="/app"
					on:click={() => {
						$settings.trail = trail;
					}}
				>
					<img src={`${trail}_logo.png`} width="100" height="100" />
					<button class="btn btn-accent btn-outline btn-lg">{trail}</button>
				</a>
			{/if}
		{/each}
	</div>
</div>

<style>
	p {
		text-align: center;
	}
</style>
