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
	import Icon from '$lib/Icon.svelte';
	import WelcomeIllustration from '$lib/WelcomeIllustration.svelte';
	let showTrails = false;
	let ready = false;
	let installHelp = false;
	let feature = 0;
	const features = [
		'Helps you navigate the trail',
		'Easily find points of interest along your route',
		'Give and receive live updates from other hikers'
	];
	/** @type {Record<string,string>} */
	const names = {
		PCT: 'Pacific Crest Trail',
		AT: 'Appalachian Trail',
		CDT: 'Continental Divide Trail'
	};
	onMount(() => {
		if (window.location.hostname.split('.')[0] === 'test') {
			goto('/app');
			return;
		}
		showTrails =
			$isInstalled || !!$settings.trail || localStorage.getItem('welcomeSeen') === 'true';
		ready = true;
	});
	function continueToTrails() {
		localStorage.setItem('welcomeSeen', 'true');
		showTrails = true;
	}
</script>

<svelte:head
	><title>{showTrails ? 'Choose a trail' : 'Welcome'} &middot; OpenTrail</title></svelte:head
>
{#if ready}
	<main class:choose-trail={showTrails} class="onboarding">
		<header class="welcome-brand">
			<img src="/brand/logomark.svg" width="88" height="88" alt="" />
			<div>
				<h1>OpenTrail</h1>
				<p>A free trail info community</p>
			</div>
		</header>
		{#if showTrails}
			<section class="trail-choices">
				<h2>Choose your trail</h2>
				<p class="muted">You can change this any time in Settings.</p>
				{#each Object.keys(TRAILS).filter((t) => t !== 'test') as trail}
					{#if !$settings.offline || $settings.trail === trail}
						<a class="trail-choice" href="/app?trail={trail}"
							><span class="trail-emblem"
								><img
									src="https://cdn.opentrail.org/{trail}_logo.png"
									width="44"
									height="44"
									alt=""
								/></span
							><strong>{names[trail]}</strong><Icon name="chevron" /></a
						>
					{/if}
				{/each}
				{#if $settings.offline}<p class="muted">
						Turn off offline mode in Settings to switch trails.
					</p>{/if}
			</section>
			<footer>
				Data contributions are open for public use under the <a
					href="https://opendatacommons.org/licenses/odbl/summary/">Open Database License</a
				>.
				<div>
					<a href="https://cdn.opentrail.org/terms.html">Terms</a> ?
					<a href="https://cdn.opentrail.org/privacy.html">Privacy</a>
				</div>
			</footer>
		{:else}
			<section
				class="welcome-feature"
				aria-roledescription="carousel"
				aria-label="OpenTrail features"
			>
				<WelcomeIllustration {feature} />
				<div class="feature-copy">
					<h2 aria-live="polite">{features[feature]}</h2>
					<div class="carousel-controls">
						<button
							class="icon-button"
							aria-label="Previous feature"
							disabled={feature === 0}
							onclick={() => (feature = Math.max(0, feature - 1))}><Icon name="back" /></button
						>
						<div class="carousel-dots">
							{#each features as _, i}<button
									class:active={feature === i}
									aria-label="Feature {i + 1}"
									aria-pressed={feature === i}
									onclick={() => (feature = i)}
								></button>{/each}
						</div>
						<button
							class="icon-button"
							aria-label="Next feature"
							disabled={feature === features.length - 1}
							onclick={() => (feature = Math.min(features.length - 1, feature + 1))}
							><Icon name="chevron" /></button
						>
					</div>
				</div>
			</section>
			{#if !$isInstalled}<button
					class="btn install-button"
					onclick={() => ($deferredPrompt ? promptInstall() : (installHelp = !installHelp))}
					><Icon name="download" /> Install app</button
				>
				{#if installHelp}<div class="install-help" role="status">
						{#if $platform === 'ios-safari'}Tap <strong>Share</strong>, then
							<strong>Add to Home Screen</strong>, then <strong>Add</strong>.{:else}Open your
							browser menu and choose <strong>Install app</strong> or
							<strong>Add to Home Screen</strong>. If unavailable, try Safari on iOS or Chrome on
							Android.{/if}
					</div>{/if}
			{/if}
			<button class="skip-install" onclick={continueToTrails}
				>{$isInstalled ? 'Continue' : 'Not now'}</button
			>
			{#if !$isInstalled}
				<p class="install-note">
					You can use OpenTrail without installing, but offline maps and some features need the app.
					You can install it later from Settings.
				</p>
			{/if}
		{/if}
	</main>
{/if}
