<script>
	import {
		data, detailId, renderedMarkers, settings, trailRoute,
		selectedMarkerId, userMiles, listMode, listBoundsFilter,
		listCommentSort, listSearchQuery, listScrollPosition, activeIcons, ICONS
	} from '$lib/store.js';
	import MarkerDetail from '$lib/MarkerDetail.svelte';
	import { searchTrailRoute, miToKm } from '$lib/helpers.js';
import dayjs from 'dayjs';
	import { onMount, onDestroy, tick } from 'svelte';

	let scrollContainer;
	let expandedComment = -1;
	let gpsLoading = false;
	let gpsEnabled = false;

	function onScroll() {
		if (!scrollContainer) return;
		$listScrollPosition = scrollContainer.scrollTop;
	}

	onMount(async () => {
		await tick();
		if (scrollContainer && $listScrollPosition) {
			scrollContainer.scrollTop = $listScrollPosition;
		}
	});

	onDestroy(() => {
		if (scrollContainer) $listScrollPosition = scrollContainer.scrollTop;
	});

	$: userRecent = new Date() - $userMiles.date < 1000000;
	$: totalCoords = $trailRoute.features?.[0]?.geometry?.coordinates?.length || 0;
	$: totalMiles = totalCoords / 10;
	$: imp = $settings.units !== 'metric';
	$: query = ($listSearchQuery || '').toLowerCase();
	$: gpsMile = userRecent && gpsEnabled ? $userMiles.miles : -1;

	function displayMile(rawMile) {
		return $settings.reverseMiles ? totalMiles - parseFloat(rawMile) : parseFloat(rawMile);
	}

	function toggleGps() {
		if (gpsEnabled) {
			gpsEnabled = false;
			return;
		}
		if (userRecent) {
			gpsEnabled = true;
			scrollToGpsLine();
		} else {
			requestLocation();
		}
	}

	function requestLocation() {
		if (!navigator.geolocation) return;
		gpsLoading = true;
		navigator.geolocation.getCurrentPosition(
			(pos) => {
				const result = searchTrailRoute(pos.coords.longitude, pos.coords.latitude, $trailRoute, 1);
				if (result.index >= 0) {
					$userMiles = { miles: result.index / 10, date: new Date() };
					gpsEnabled = true;
					scrollToGpsLine();
				}
				gpsLoading = false;
			},
			() => { gpsLoading = false; },
			{ enableHighAccuracy: true }
		);
	}

	function scrollToGpsLine() {
		tick().then(() => {
			const el = scrollContainer?.querySelector('.gps-line');
			if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
		});
	}

	$: markerIds = $listBoundsFilter
		? [...$renderedMarkers]
		: $data.features.map((_, i) => i);

	$: filteredMarkers = markerIds.filter(id => {
		if ($listBoundsFilter) {
			const p = $data.features[id]?.properties;
			if (!p) return false;
			const hasActiveIcon = [...p.icons].some(ch => {
				const idx = ICONS.indexOf(ch);
				return idx >= 0 && $activeIcons[idx];
			});
			if (!hasActiveIcon) return false;
		}
		if (!query) return true;
		const p = $data.features[id]?.properties;
		if (!p) return false;
		return p.title.toLowerCase().includes(query) || p.desc.toLowerCase().includes(query);
	}).sort((a, b) => displayMile($data.features[a].properties.mile) - displayMile($data.features[b].properties.mile));

	$: allComments = $data.features.flatMap((f, idx) =>
		(f.properties.comments || []).map((c, ci) => ({
			text: c.text,
			user: c.user || '',
			date: c.date,
			markerId: idx,
			commentIdx: ci,
			mile: parseFloat(f.properties.mile),
			markerTitle: f.properties.title,
			markerIcon: f.properties.icon
		}))
	);

	$: commentsInBounds = $listBoundsFilter
		? allComments.filter(c => $renderedMarkers.includes(c.markerId))
		: allComments;

	$: filteredComments = commentsInBounds.filter(c => {
		if (!query) return true;
		return c.text.toLowerCase().includes(query) || (c.user || '').toLowerCase().includes(query);
	});

	$: sortedComments = $listCommentSort === 'recent'
		? [...filteredComments].sort((a, b) => b.date.localeCompare(a.date))
		: [...filteredComments].sort((a, b) => displayMile(a.mile) - displayMile(b.mile));

	$: gpsDisplayMile = gpsMile >= 0 ? displayMile(gpsMile) : -1;

	$: gpsLineMarkerIdx = (() => {
		if ($listMode !== 'markers' || gpsDisplayMile < 0 || filteredMarkers.length === 0) return -1;
		for (let i = 0; i < filteredMarkers.length; i++) {
			if (displayMile($data.features[filteredMarkers[i]]?.properties?.mile) > gpsDisplayMile) return i;
		}
		return filteredMarkers.length;
	})();

	$: gpsLineCommentIdx = (() => {
		if ($listMode !== 'comments' || $listCommentSort !== 'mile' || gpsDisplayMile < 0 || sortedComments.length === 0) return -1;
		for (let i = 0; i < sortedComments.length; i++) {
			if (displayMile(sortedComments[i].mile) > gpsDisplayMile) return i;
		}
		return sortedComments.length;
	})();

	function listNavigate(id) {
		$selectedMarkerId = id;
		$detailId = id;
	}

	$: listPos = filteredMarkers.indexOf($detailId);
	$: listOnPrev = listPos > 0 ? () => listNavigate(filteredMarkers[listPos - 1]) : undefined;
	$: listOnNext = listPos >= 0 && listPos < filteredMarkers.length - 1 ? () => listNavigate(filteredMarkers[listPos + 1]) : undefined;

	function openMarkerDetail(markerId) {
		$selectedMarkerId = markerId;
		$detailId = markerId;
	}

	function toggleComment(idx) {
		expandedComment = expandedComment === idx ? -1 : idx;
	}

	function formatMile(mile) {
		const dm = displayMile(mile);
		if (!imp) return miToKm(dm).toFixed(1) + 'km';
		return dm.toFixed(1) + 'mi';
	}
</script>

<div class="flex flex-col h-full">
	<div class="sticky top-0 z-10 bg-base-100 border-b border-base-300 p-2 space-y-2">
		<div class="flex justify-center">
			<div class="btn-group">
				<button
					class="btn btn-sm {$listMode === 'markers' ? 'btn-active' : ''}"
					onclick={() => { $listMode = 'markers'; expandedComment = -1; }}
				>Markers</button>
				<button
					class="btn btn-sm {$listMode === 'comments' ? 'btn-active' : ''}"
					onclick={() => { $listMode = 'comments'; expandedComment = -1; }}
				>Comments</button>
			</div>
		</div>
		<div class="flex gap-2 items-center justify-center flex-wrap">
			<div class="btn-group">
				<button
					class="btn btn-sm {$listBoundsFilter ? 'btn-active' : ''}"
					onclick={() => { $listBoundsFilter = true; expandedComment = -1; }}
				>Visible</button>
				<button
					class="btn btn-sm {!$listBoundsFilter ? 'btn-active' : ''}"
					onclick={() => { $listBoundsFilter = false; expandedComment = -1; }}
				>All</button>
			</div>
			{#if $listMode === 'comments'}
	<button
			class="btn btn-sm"
			onclick={() => { $listCommentSort = $listCommentSort === 'recent' ? 'mile' : 'recent'; expandedComment = -1; }}
		>Sort: {$listCommentSort === 'recent' ? 'Recent' : 'Mile'}</button>
			{/if}
			{#if $listCommentSort === 'mile' || $listMode === 'markers'}
				<button
					class="btn btn-sm rounded-lg min-w-0 px-2 {gpsEnabled ? 'bg-blue-500 hover:bg-blue-600 border-blue-500 text-white' : ''}"
					onclick={toggleGps}
					disabled={gpsLoading}
					title="Show my location"
				>
					{#if gpsLoading}
						<span class="loading loading-spinner loading-xs"></span>
					{:else}
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20.94 11c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/></svg>
					{/if}
				</button>
			{/if}
		</div>
		<input
			type="text"
			placeholder="Search..."
			class="input input-sm input-bordered w-full"
			value={$listSearchQuery}
			oninput={(e) => $listSearchQuery = e.currentTarget.value}
		/>
	</div>

	<div class="overflow-y-auto flex-1 min-h-0" bind:this={scrollContainer} onscroll={onScroll}>
		{#if $listMode === 'markers'}
			{#each filteredMarkers as i, idx}
				{#if gpsLineMarkerIdx >= 0 && idx === gpsLineMarkerIdx}
					<div class="h-1 bg-blue-500 gps-line"></div>
				{/if}
				<div
					class="flex items-center px-2 py-1.5 hover:bg-base-200 cursor-pointer border-b border-base-200"
					onclick={() => $detailId = i}
				>
					<img
						src={`https://cdn.opentrail.org/icons/${$data.features[i].properties.icon}.png`}
						height="40"
						width="40"
						class="mx-1"
					/>
					<span class="w-20 text-center font-mono text-sm">{formatMile($data.features[i].properties.mile)}</span>
					<span class="truncate flex-1">{$data.features[i].properties.title}</span>
				</div>
			{/each}
			{#if gpsLineMarkerIdx === filteredMarkers.length}
				<div class="h-1 bg-blue-500 gps-line"></div>
			{/if}
		{:else}
			{#each sortedComments as c, idx}
				{#if gpsLineCommentIdx >= 0 && idx === gpsLineCommentIdx}
					<div class="h-1 bg-blue-500 gps-line"></div>
				{/if}
				<div class="px-3 py-2 border-b border-base-200">
					<div class="cursor-pointer" onclick={() => toggleComment(idx)}>
						{#if expandedComment === idx}
							<p class="text-sm whitespace-pre-wrap">{c.text}</p>
						{:else}
							<p class="text-sm">{c.text.length > 80 ? c.text.slice(0, 80) + '...' : c.text}</p>
						{/if}
					</div>
					<div class="flex items-center gap-1.5 mt-1 text-xs opacity-60 flex-wrap">
						<span class="font-medium">{c.user || 'Anonymous'}</span>
						<span>&middot;</span>
						<span>{dayjs(c.date).format($settings.dateFormat)}</span>
						<span>&middot;</span>
						<span class="font-mono">{formatMile(c.mile)}</span>
						<button
							class="link link-info inline-flex items-center gap-0.5 font-medium no-underline"
							onclick={(e) => { e.stopPropagation(); openMarkerDetail(c.markerId); }}
						>
							{c.markerTitle}
							<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
						</button>
					</div>
				</div>
			{/each}
			{#if gpsLineCommentIdx === sortedComments.length}
				<div class="h-1 bg-blue-500 gps-line"></div>
			{/if}
		{/if}

		{#if ($listMode === 'markers' && filteredMarkers.length === 0) || ($listMode === 'comments' && sortedComments.length === 0)}
			<div class="text-lg flex items-center justify-center h-32 opacity-50">
				{#if query}
					No results found
				{:else}
					No {$listMode} {$listBoundsFilter ? 'in map window' : 'available'}
				{/if}
			</div>
		{/if}
	</div>
</div>

{#if $detailId !== -1}
	<MarkerDetail onPrev={listOnPrev} onNext={listOnNext} />
{/if}
