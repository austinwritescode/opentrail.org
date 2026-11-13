<script>
	import { onMount } from 'svelte';
	import { settings, TRAILS } from './store.js';
	import Icon from './Icon.svelte';
	export let ontrailchange;
	export let busy = false;
	let expanded = false;
	let desktop = false;
	let menu;
	const names = {
		PCT: 'Pacific Crest Trail',
		AT: 'Appalachian Trail',
		CDT: 'Continental Divide Trail',
		test: 'Test trail'
	};
	onMount(() => {
		const media = window.matchMedia('(min-width: 768px)');
		const resize = () => {
			desktop = media.matches;
			expanded = false;
		};
		resize();
		media.addEventListener('change', resize);
		const outside = (event) => {
			if (!menu.contains(event.target)) expanded = false;
		};
		const escape = (event) => {
			if (event.key === 'Escape' && expanded) {
				expanded = false;
				menu.querySelector('.trail-menu-toggle').focus();
				event.stopPropagation();
			}
		};
		document.addEventListener('pointerdown', outside);
		document.addEventListener('keydown', escape);
		return () => {
			media.removeEventListener('change', resize);
			document.removeEventListener('pointerdown', outside);
			document.removeEventListener('keydown', escape);
		};
	});
</script>

<div class="trail-menu" bind:this={menu}>
	<button
		class="trail-menu-toggle"
		aria-label="Trail and direction"
		aria-expanded={desktop || expanded}
		aria-controls="map-trail-options"
		onclick={() => {
			if (!desktop) expanded = !expanded;
		}}
	>
		<img src="/brand/logomark.svg" width="36" height="36" alt="" /><Icon
			name="chevron-down"
			size={14}
		/>
	</button>
	<div id="map-trail-options" class="trail-menu-options" class:expanded>
		<label class="trail-menu-select"
			><span>Trail</span><select
				aria-label="Trail"
				value={$settings.trail}
				disabled={busy || $settings.offline}
				onchange={async (event) => {
					const select = event.currentTarget;
					await ontrailchange(select.value);
					select.value = $settings.trail;
				}}
			>
				{#each Object.keys(TRAILS).filter((trail) => trail !== 'test' || $settings.trail === 'test') as trail}<option
						value={trail}>{names[trail]}</option
					>{/each}
			</select></label
		>
		<fieldset class="trail-menu-direction">
			<legend>Direction</legend>
			<div class="direction-options" role="group" aria-label="Direction of travel">
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
		</fieldset>
		{#if $settings.offline}<a class="trail-menu-help" href="/app/settings"
				>Manage offline maps in Settings to change trails.</a
			>{/if}
	</div>
</div>
