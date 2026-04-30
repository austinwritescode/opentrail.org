<script>
	import { data, settings, trailRoute, userMiles } from '$lib/store.js';
	import { parseDescURL, isSafeURL, mToFt, ftToM, formatDist, formatElev } from '$lib/helpers.js';
	export let index;
	export let offset;

	const prop = $data.features[index].properties;
	const imp = $settings.units !== 'metric';
	const totalMiles = $trailRoute.features?.[0]?.geometry.coordinates.length / 10;
	const displayMile = $settings.reverseMiles && totalMiles != null
		? totalMiles - prop.mile
		: Number(prop.mile);
	const userCoords = $trailRoute.features?.[0]?.geometry.coordinates;
	const userIdx = Math.round($userMiles.miles * 10);
	const userElevFt = userCoords?.[userIdx]?.[2] != null ? mToFt(userCoords[userIdx][2]) : null;
	const mileDiff = Math.round(Math.abs($userMiles.miles - Number(prop.mile)) * 10) / 10;
	const mileSign = $settings.reverseMiles
		? ($userMiles.miles >= Number(prop.mile) ? '+' : '-')
		: (Number(prop.mile) >= $userMiles.miles ? '+' : '-');
	const elevDiffFt = userElevFt != null && prop.elev != null ? Math.round(Math.abs(userElevFt - Number(prop.elev))) : null;
	const elevSign = userElevFt != null && prop.elev != null ? (Number(prop.elev) >= userElevFt ? '+' : '-') : '';
	const userRecent = new Date() - $userMiles.date < 1000000;
</script>

<swiper-slide virtualIndex={index} style={`left: ${offset}px`}>
	<div class="block h-full cursor-pointer" onclick={() => window.location.hash = `detail=${$data.features[index]?.id}`}>
		<div class="bg-base-100 rounded-lg pt-2 p-4 w-full h-full select-text">
			{#if prop.images.length > 0}
				<div class="indicator float-right rounded-lg m-1">
					{#if prop.images.length > 1}
						<span class="indicator-item badge badge-neutral p-1.5">
							{prop.images.length}
						</span>
					{/if}
					<img
						src={`https://cdn.opentrail.org/img/${prop.images[0]}.jpg`}
						height="80"
						width="80"
						class="rounded-lg"
						loading="lazy"
					/>
				</div>
			{/if}
			<p class="text-sm font-bold truncate">
				{prop.title}
				{#if prop.icons}
					{#each prop.icons as icon}
						<img src={`/map-icons/${icon}.png`} height="20" width="20" class="inline align-middle" />
					{/each}
				{/if}
			</p>
			<p class="text-sm italic">
				{#if imp}Mile {displayMile.toFixed(1)}{#if userRecent}&nbsp;({mileSign}{mileDiff}){/if}{:else}{formatDist(displayMile, false, 1)}{#if userRecent}&nbsp;({mileSign}{formatDist(mileDiff, false, 1)}){/if}{/if}&nbsp;&nbsp;&nbsp;{#if imp}Elev {prop.elev?.toLocaleString('en-US')}'{#if userRecent && elevDiffFt != null}&nbsp;({elevSign}{elevDiffFt}'){/if}{:else}Elev {formatElev(prop.elev != null ? ftToM(prop.elev) : null, false)}{#if userRecent && elevDiffFt != null}&nbsp;({elevSign}{Math.round(ftToM(elevDiffFt))}m){/if}{/if}
			</p>
			<p class="text-sm whitespace-pre-wrap break-words">
				{#each parseDescURL(prop.desc) as token}
					{#if token.startsWith('http://') || token.startsWith('https://')}
						{#if isSafeURL(token)}
							<a href={token} class="link" target="_blank" rel="noopener noreferrer">{token}</a>
						{:else}{token}{/if}
					{:else if token.startsWith('www.')}
						<a href={'https://' + token} class="link" target="_blank" rel="noopener noreferrer">{token}</a>
					{:else}{token}{/if}
				{/each}
			</p>
		</div>
	</div>
</swiper-slide>
