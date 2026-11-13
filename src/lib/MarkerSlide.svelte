<script>
	import Icon from '$lib/Icon.svelte';
	import WaypointBadge from '$lib/WaypointBadge.svelte';
	import { data, settings, trailRoute, userMiles, detailId } from '$lib/store.js';
	import { parseDescURL, isSafeURL, mToFt, ftToM, formatDist, formatElev } from '$lib/helpers.js';
	export let index;
	export let offset;
	export let onPrev;
	export let onNext;
	export let onClose;

	$: prop = $data.features[index].properties;
	$: imp = $settings.units !== 'metric';
	$: totalMiles = $trailRoute.features?.[0]?.geometry.coordinates.length / 10;
	$: displayMile =
		$settings.reverseMiles && totalMiles != null ? totalMiles - prop.mile : Number(prop.mile);
	$: userCoords = $trailRoute.features?.[0]?.geometry.coordinates;
	$: userIdx = Math.round($userMiles.miles * 10);
	$: userElevFt = userCoords?.[userIdx]?.[2] != null ? mToFt(userCoords[userIdx][2]) : null;
	$: mileDiff = Math.round(Math.abs($userMiles.miles - Number(prop.mile)) * 10) / 10;
	$: mileSign = $settings.reverseMiles
		? $userMiles.miles >= Number(prop.mile)
			? '+'
			: '-'
		: Number(prop.mile) >= $userMiles.miles
			? '+'
			: '-';
	$: elevDiffFt =
		userElevFt != null && prop.elev != null
			? Math.round(Math.abs(userElevFt - Number(prop.elev)))
			: null;
	$: elevSign =
		userElevFt != null && prop.elev != null ? (Number(prop.elev) >= userElevFt ? '+' : '-') : '';
	$: userRecent = new Date() - $userMiles.date < 1000000;
	$: commentCount = prop.comments?.length ?? 0;
</script>

<swiper-slide virtualIndex={index} style={`left: ${offset}px`}>
	<div
		class="block cursor-pointer"
		onclick={(event) => {
			// Disabled buttons may pass pointer events to their containing action row.
			if (event.target instanceof Element && event.target.closest('.selected-actions')) return;
			$detailId = $data.features[index]?.id;
		}}
	>
		<div
			class="selected-waypoint-card bg-base-100 rounded-lg pt-2 pb-2 p-4 w-full select-text relative overflow-visible flex flex-col"
		>
			<div class="selected-content">
				<div class="selected-header">
					<WaypointBadge kind={prop.icon} size={40} />
					<div class="selected-heading-copy">
						<p class="selected-title">{prop.title}</p>
						<p class="selected-meta muted">
							{#if imp}Mile {displayMile.toFixed(
									1
								)}{#if userRecent}&nbsp;({mileSign}{mileDiff}){/if}{:else}{formatDist(
									displayMile,
									false,
									1
								)}{#if userRecent}&nbsp;({mileSign}{formatDist(
										mileDiff,
										false,
										1
									)}){/if}{/if}&nbsp;&nbsp;&nbsp;{#if imp}Elev {prop.elev?.toLocaleString(
									'en-US'
								)}'{#if userRecent && elevDiffFt != null}&nbsp;({elevSign}{elevDiffFt}'){/if}{:else}Elev
								{formatElev(
									prop.elev != null ? ftToM(prop.elev) : null,
									false
								)}{#if userRecent && elevDiffFt != null}&nbsp;({elevSign}{Math.round(
										ftToM(elevDiffFt)
									)}m){/if}{/if}
						</p>
					</div>
					<div class="selected-header-actions">
						{#if commentCount > 0}<button
								class="selected-comments"
								aria-label={commentCount + (commentCount === 1 ? ' comment' : ' comments')}
								onclick={(event) => {
									event.stopPropagation();
									$detailId = $data.features[index]?.id;
								}}><Icon name="comment" size={16} /><span>{commentCount}</span></button
							>{/if}
						<button
							class="selected-close icon-button"
							aria-label="Close selected waypoint"
							onclick={(e) => {
								e.stopPropagation();
								onClose();
							}}><Icon name="close" size={18} /></button
						>
					</div>
				</div>
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
				<p class="selected-description text-sm whitespace-pre-wrap break-words">
					{#each parseDescURL(prop.desc) as token}
						{#if token.startsWith('http://') || token.startsWith('https://')}
							{#if isSafeURL(token)}
								<a href={token} class="link" target="_blank" rel="noopener noreferrer">{token}</a>
							{:else}{token}{/if}
						{:else if token.startsWith('www.')}
							<a href={'https://' + token} class="link" target="_blank" rel="noopener noreferrer"
								>{token}</a
							>
						{:else}{token}{/if}
					{/each}
				</p>
			</div>
			<div class="selected-actions">
				<button
					class="btn selected-arrow"
					aria-label="Previous waypoint"
					disabled={!onPrev}
					onclick={(e) => {
						e.stopPropagation();
						onPrev?.();
					}}><Icon name="chevron-left" size={20} /></button
				>
				<button
					class="btn btn-primary selected-details"
					onclick={(e) => {
						e.stopPropagation();
						$detailId = $data.features[index]?.id;
					}}>View details</button
				>

				<button
					class="btn selected-arrow"
					aria-label="Next waypoint"
					disabled={!onNext}
					onclick={(e) => {
						e.stopPropagation();
						onNext?.();
					}}><Icon name="chevron-right" size={20} /></button
				>
			</div>
		</div>
	</div>
</swiper-slide>
