<script>
	import { data, settings, trailRoute, userMiles, detailId } from '$lib/store.js';
	import { parseDescURL, isSafeURL, mToFt, ftToM, formatDist, formatElev, timeAgo } from '$lib/helpers.js';
	export let index;
	export let offset;
	export let onPrev;
	export let onNext;

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
	const commentCount = prop.comments?.length ?? 0;
	const latestComment = commentCount > 0
		? prop.comments.reduce((a, b) => new Date(a.date) > new Date(b.date) ? a : b)
		: null;
</script>

<swiper-slide virtualIndex={index} style={`left: ${offset}px`}>
	<div class="block h-full cursor-pointer" onclick={() => $detailId = $data.features[index]?.id}>
		<div class="bg-base-100 rounded-lg pt-2 pb-2 p-4 w-full h-full select-text relative overflow-visible flex flex-col">
			{#if onPrev}
				<button
					class="btn btn-circle btn-sm bg-base-100/80 hover:bg-base-100/80 border border-base-300 shadow-md absolute z-10"
					style="top: calc(50% - 16px); left: -16px;"
					onclick={(e) => { e.stopPropagation(); onPrev(); }}
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#333333" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 18l-6-6 6-6"/></svg>
				</button>
			{/if}
			{#if onNext}
				<button
					class="btn btn-circle btn-sm bg-base-100/80 hover:bg-base-100/80 border border-base-300 shadow-md absolute z-10"
					style="top: calc(50% - 16px); right: -16px;"
					onclick={(e) => { e.stopPropagation(); onNext(); }}
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#333333" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 18l6-6-6-6"/></svg>
				</button>
			{/if}
			<div class="flex-1 min-h-0 overflow-hidden">
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
							<img src={`https://cdn.opentrail.org/icons/${icon}.png`} height="20" width="20" class="inline align-middle" />
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
			{#if commentCount > 0}
				<div class="flex items-center gap-1.5 text-xs mt-1 shrink-0">
					<svg width="24" height="20" viewBox="0 0 28 22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">
						<rect x="1" y="1" width="26" height="16" rx="3" />
						<polygon points="7,17 7,21 12,17" fill="none" />
						<text x="14" y="13" text-anchor="middle" font-size="10" font-weight="bold" fill="currentColor" stroke="none">{commentCount}</text>
					</svg>
					<span>{timeAgo(latestComment.date)}</span>
				</div>
			{/if}
		</div>
	</div>
</swiper-slide>
