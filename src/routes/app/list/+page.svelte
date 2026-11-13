<script>
	import { page } from '$app/stores';
	import Icon from '$lib/Icon.svelte';
	import WaypointBadge from '$lib/WaypointBadge.svelte';
	import Highlight from '$lib/Highlight.svelte';
	import { waypointKinds } from '$lib/waypoint-icons.js';
	let filterOpen = false;
	let searchOpen = false;
	let locationError = '';
	$: $listMode = $page.url.searchParams.get('view') === 'comments' ? 'comments' : 'markers';
	$: hiddenCount = $activeIcons.filter((active) => !active).length;
	/** @param {number} i */
	function toggleType(i) {
		$activeIcons[i] = !$activeIcons[i];
	}
	/** @param {number} mile */
	function relativeDistance(mile) {
		const distance = displayMile(mile) - displayMile($userMiles.miles);
		return (
			(imp
				? Math.abs(distance).toFixed(1) + ' mi'
				: miToKm(Math.abs(distance)).toFixed(1) + ' km') + (distance >= 0 ? ' ahead' : ' behind')
		);
	}
	import {
		data,
		detailId,
		renderedMarkers,
		settings,
		trailRoute,
		selectedMarkerId,
		userMiles,
		listMode,
		listBoundsFilter,
		listCommentSort,
		listSearchQuery,
		listScrollPosition,
		activeIcons,
		ICONS
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
		locationError = '';
		if (gpsEnabled) {
			scrollToGpsLine();
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
		if (!navigator.geolocation) {
			locationError = 'Location is unavailable in this browser.';
			return;
		}
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
			() => {
				gpsLoading = false;
				locationError = 'Could not get your location. Check location permission and try again.';
			},
			{ enableHighAccuracy: true }
		);
	}

	function scrollToGpsLine() {
		tick().then(() => {
			const el = scrollContainer?.querySelector('.gps-line');
			if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
		});
	}

	$: markerIds = $listBoundsFilter ? [...$renderedMarkers] : $data.features.map((_, i) => i);

	$: filteredMarkers = markerIds
		.filter((id) => {
			{
				const p = $data.features[id]?.properties;
				if (!p) return false;
				const hasActiveIcon = [...(p.icons || p.icon || '')].some((ch) => {
					const idx = ICONS.indexOf(ch);
					return idx >= 0 && $activeIcons[idx];
				});
				if (!hasActiveIcon) return false;
			}
			if (!query) return true;
			const p = $data.features[id]?.properties;
			if (!p) return false;
			return p.title.toLowerCase().includes(query) || p.desc.toLowerCase().includes(query);
		})
		.sort(
			(a, b) =>
				displayMile($data.features[a].properties.mile) -
				displayMile($data.features[b].properties.mile)
		);

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
		? allComments.filter((c) => $renderedMarkers.includes(c.markerId))
		: allComments;

	$: filteredComments = commentsInBounds.filter((c) => {
		if (!query) return true;
		return c.text.toLowerCase().includes(query) || (c.user || '').toLowerCase().includes(query);
	});

	$: sortedComments =
		$listCommentSort === 'recent'
			? [...filteredComments].sort((a, b) => b.date.localeCompare(a.date))
			: [...filteredComments].sort((a, b) => displayMile(a.mile) - displayMile(b.mile));

	$: gpsDisplayMile = gpsMile >= 0 ? displayMile(gpsMile) : -1;

	$: gpsLineMarkerIdx = (() => {
		if ($listMode !== 'markers' || gpsDisplayMile < 0 || filteredMarkers.length === 0) return -1;
		for (let i = 0; i < filteredMarkers.length; i++) {
			if (displayMile($data.features[filteredMarkers[i]]?.properties?.mile) > gpsDisplayMile)
				return i;
		}
		return filteredMarkers.length;
	})();

	$: gpsLineCommentIdx = (() => {
		if (
			$listMode !== 'comments' ||
			$listCommentSort !== 'mile' ||
			gpsDisplayMile < 0 ||
			sortedComments.length === 0
		)
			return -1;
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
	$: listOnNext =
		listPos >= 0 && listPos < filteredMarkers.length - 1
			? () => listNavigate(filteredMarkers[listPos + 1])
			: undefined;

	function openMarkerDetail(markerId) {
		$selectedMarkerId = markerId;
		$detailId = markerId;
	}

	function toggleComment(idx) {
		expandedComment = expandedComment === idx ? -1 : idx;
	}

	function formatMile(mile) {
		const dm = displayMile(mile);
		if (!imp) return miToKm(dm).toFixed(1) + ' km';
		return dm.toFixed(1) + ' mi';
	}
</script>

<svelte:head
	><title>{$listMode === 'markers' ? 'Waypoints' : 'Comments'} &middot; OpenTrail</title
	></svelte:head
>
<div class="waypoints-page">
	<header class="list-header">
		<div class="page-heading">
			<h1>{$listMode === 'markers' ? 'Waypoints' : 'Comments'}</h1>
			<button
				class="icon-button"
				aria-label="Jump to my position"
				onclick={toggleGps}
				disabled={gpsLoading}><Icon name="locate" /></button
			>
			{#if $listMode === 'markers'}<button
					class="icon-button"
					class:chosen={hiddenCount > 0}
					aria-label="Filter waypoint types"
					aria-expanded={filterOpen}
					onclick={() => (filterOpen = !filterOpen)}
					><Icon name="filter" />{#if hiddenCount}<span class="filter-count">{hiddenCount}</span
						>{/if}</button
				>{/if}
			<button
				class="icon-button"
				aria-label="Search"
				aria-expanded={searchOpen}
				onclick={() => {
					searchOpen = !searchOpen;
					if (!searchOpen) $listSearchQuery = '';
				}}><Icon name="search" /></button
			>
		</div>
		{#if filterOpen && $listMode === 'markers'}
			<div class="type-dropdown">
				<div class="page-heading">
					<strong>Waypoint types</strong><button
						class="icon-button"
						aria-label="Close filters"
						onclick={() => (filterOpen = false)}><Icon name="close" size={18} /></button
					>
				</div>
				{#each ICONS as kind, i}<label
						><WaypointBadge {kind} size={28} /><span>{waypointKinds[kind].label}</span><input
							type="checkbox"
							class="checkbox checkbox-sm"
							checked={$activeIcons[i]}
							onchange={() => toggleType(i)}
						/></label
					>{/each}
				<button class="text-link" onclick={() => ($activeIcons = ICONS.map(() => true))}
					>Show all types</button
				>
			</div>
		{/if}
		{#if searchOpen || $listSearchQuery}<label class="search-field"
				><Icon name="search" size={20} /><input
					type="search"
					aria-label="Search waypoints or comments"
					placeholder={$listMode === 'markers' ? 'Search waypoints' : 'Search comments'}
					bind:value={$listSearchQuery}
				/></label
			>{/if}
		<div class="segmented" role="group" aria-label="Which waypoints to show">
			<button
				class:active={$listBoundsFilter}
				aria-pressed={$listBoundsFilter}
				onclick={() => ($listBoundsFilter = true)}>Visible on map</button
			><button
				class:active={!$listBoundsFilter}
				aria-pressed={!$listBoundsFilter}
				onclick={() => ($listBoundsFilter = false)}
				>All {$listMode === 'markers' ? 'waypoints' : 'comments'}</button
			>
		</div>
		{#if $listMode === 'comments'}<div class="list-summary">
				<span>Notes from the trail community</span><button
					class="text-link"
					onclick={() => ($listCommentSort = $listCommentSort === 'recent' ? 'mile' : 'recent')}
					>Sort: {$listCommentSort === 'recent' ? 'Recent' : 'Mile'} &#8597;</button
				>
			</div>{/if}
		{#if query}<p class="muted text-sm" aria-live="polite">
				{$listMode === 'markers' ? filteredMarkers.length : sortedComments.length} results
			</p>{/if}
		{#if locationError}<p role="status" class="text-sm">{locationError}</p>{/if}
	</header>
	<div class="waypoint-scroll" bind:this={scrollContainer} onscroll={onScroll}>
		{#if $listMode === 'markers'}
			<div class="waypoint-timeline">
				{#each filteredMarkers as i, idx}
					{@const prop = $data.features[i].properties}
					{#if gpsLineMarkerIdx === idx}<div class="gps-line">
							<span></span>You are here &middot; {formatMile(gpsMile)}
						</div>{/if}
					<button class="waypoint-row" onclick={() => ($detailId = i)}>
						<WaypointBadge kind={prop.icon} /><span class="waypoint-row-copy"
							><span class="waypoint-title"><Highlight text={prop.title} {query} /></span><span
								class="waypoint-meta"
								>{formatMile(prop.mile)}{#if prop.elev != null}
									&middot; {imp
										? Math.round(prop.elev).toLocaleString() + ' ft'
										: Math.round(prop.elev * 0.3048).toLocaleString() +
											' m'}{/if}{#if prop.comments?.length}
									&middot; {prop.comments.length} comments{/if}</span
							>{#if query && userRecent}<span class="distance-label"
									>{relativeDistance(prop.mile)}</span
								>{/if}{#if query && prop.desc?.toLowerCase().includes(query)}<span
									class="search-excerpt"><Highlight text={prop.desc} {query} /></span
								>{/if}</span
						><Icon name="chevron" size={18} />
					</button>
				{/each}
				{#if gpsLineMarkerIdx === filteredMarkers.length}<div class="gps-line">
						<span></span>You are here &middot; {formatMile(gpsMile)}
					</div>{/if}
			</div>
		{:else}
			<div class="comments-list">
				{#each sortedComments as c, idx}
					{#if gpsLineCommentIdx === idx}<div class="gps-line">
							You are here &middot; {formatMile(gpsMile)}
						</div>{/if}
					<article class="comment-card">
						<header>
							<img src="/brand/signpost-forest.svg" alt="" width="36" height="36" />
							<div>
								<strong>{c.user || 'Anonymous'}</strong><time
									>{dayjs(c.date).format($settings.dateFormat)}</time
								>
							</div>
						</header>
						<button
							class="comment-body"
							aria-expanded={expandedComment === idx}
							onclick={() => toggleComment(idx)}
							><Highlight
								text={expandedComment === idx || c.text.length <= 180
									? c.text
									: c.text.slice(0, 180) + '\u2026'}
								{query}
							/></button
						>
						<button class="comment-waypoint" onclick={() => openMarkerDetail(c.markerId)}
							><WaypointBadge kind={c.markerIcon} size={24} /><span
								>{c.markerTitle}<small>{formatMile(c.mile)}</small></span
							><Icon name="chevron" size={16} /></button
						>
					</article>
				{/each}
				{#if gpsLineCommentIdx === sortedComments.length}<div class="gps-line">
						You are here &middot; {formatMile(gpsMile)}
					</div>{/if}
			</div>
		{/if}
		{#if ($listMode === 'markers' && filteredMarkers.length === 0) || ($listMode === 'comments' && sortedComments.length === 0)}<div
				class="empty-state"
			>
				<Icon name={query ? 'search' : 'pin'} size={32} />
				<h2>{query ? 'No results found' : 'Nothing here yet'}</h2>
				<p>
					{query
						? 'Try another name or a different waypoint type.'
						: $listBoundsFilter
							? 'Move the map or select All to explore more of the trail.'
							: 'Trail information will appear here when it is available.'}
				</p>
			</div>{/if}
	</div>
</div>
{#if $detailId !== -1}<MarkerDetail onPrev={listOnPrev} onNext={listOnNext} />{/if}
