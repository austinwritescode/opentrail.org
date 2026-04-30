<script>
	import { onMount } from 'svelte';
	import {
		profileData,
		renderedMarkers,
		data,
		settings,
		userMiles,
		trailRoute,
		selectedMarkerId,
		ICON_COLORS,
		ICONS,
		activeIcons
	} from '$lib/store.js';
	import { mToFt, ftToM, miToKm } from '$lib/helpers.js';

	export let oncursorupdate = () => {};

	const PADDING = { top: 10, right: 8, bottom: 22, left: 38 };


	let svgEl;
	let containerEl;
	let width = 0;
	let height = 0;

	$: imperial = $settings.units !== 'metric';
	$: dark = $settings.dark;

	const THEMES = {
		light: { bg: '#fff', grid: '#e5e7eb', tick: '#666', axisLabel: '#666', areaFill: 'rgba(59, 130, 246, 0.3)', areaStroke: 'rgba(59, 130, 246, 0.8)', border: '#ddd' },
		dark: { bg: '#1e1e1e', grid: '#333', tick: '#999', axisLabel: '#999', areaFill: 'rgba(59, 130, 246, 0.25)', areaStroke: 'rgba(59, 130, 246, 0.7)', border: '#444' }
	};
	$: theme = dark ? THEMES.dark : THEMES.light;

	function scaleX(localIdx, pointCount) {
		if (pointCount <= 1) return PADDING.left;
		return PADDING.left + (localIdx / (pointCount - 1)) * (width - PADDING.left - PADDING.right);
	}

	function scaleY(elev, elevMin, elevMax) {
		if (elevMin === elevMax) return PADDING.top + (height - PADDING.top - PADDING.bottom) / 2;
		return PADDING.top + (1 - (elev - elevMin) / (elevMax - elevMin)) * (height - PADDING.top - PADDING.bottom);
	}

	$: visibleMarkers = getVisibleMarkers($renderedMarkers, $data, $activeIcons);
	$: elevRange = getElevRange($profileData, imperial);
	$: paths = buildLinePath($profileData, elevRange, width, height);
	$: xTicks = buildXTicks($profileData, width, imperial);
	$: yTicks = buildYTicks(elevRange, height, imperial);
	$: geoDot = getGeoDot($userMiles, $profileData, $trailRoute, $settings);

	function getVisibleMarkers(renderedIdxs, features, iconFilters) {
		if (!features.features || features.features.length === 0) return [];
		return renderedIdxs
			.map((i) => {
				const f = features.features[i];
				if (!f || !f.properties) return null;
				return {
					id: i,
					mile: f.properties.mile,
					elev: f.properties.elev,
					icon: f.properties.icon || f.properties.icons?.[0] || 'o'
				};
			})
			.filter((m) => m && iconFilters[ICONS.indexOf(m.icon)]);
	}

	function getGeoDot(um, pd, tr, s) {
		if (new Date() - um.date > 1000000) return null;
		if (!tr.features || pd.points.length === 0) return null;
		const totalCoords = tr.features[0].geometry.coordinates.length;
		let mile = um.miles;
		if (s.reverseMiles) mile = totalCoords / 10 - mile;
		const trailIdx = Math.round(mile * 10);
		if (trailIdx < pd.startIdx || trailIdx > pd.endIdx) return null;
		const localIdx = pd.endIdx > pd.startIdx
			? Math.round(((trailIdx - pd.startIdx) / (pd.endIdx - pd.startIdx)) * (pd.points.length - 1))
			: 0;
		if (localIdx < 0 || localIdx >= pd.points.length) return null;
		return { localIdx, elev: pd.points[localIdx].elev };
	}

	function getElevRange(pd, imp) {
		if (pd.points.length === 0) return { min: 0, max: 0 };
		let min = Infinity;
		let max = -Infinity;
		for (const p of pd.points) {
			const v = imp ? mToFt(p.elev) : p.elev;
			if (v < min) min = v;
			if (v > max) max = v;
		}
		if (min === max) { min -= 100; max += 100; }
		const step = imp ? 1000 : 500;
		min = Math.floor(min / step) * step;
		max = Math.ceil(max / step) * step;
		return { min, max };
	}

	function buildLinePath(pd, er, w, h) {
		if (pd.points.length === 0 || w === 0 || h === 0) return { area: '', line: '' };
		const bottom = h - PADDING.bottom;
		let line = '';
		let area = '';
		for (let i = 0; i < pd.points.length; i++) {
			const x = scaleX(i, pd.points.length);
			const elevConverted = imperial ? mToFt(pd.points[i].elev) : pd.points[i].elev;
			const y = scaleY(elevConverted, er.min, er.max);
			const cmd = (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
			line += cmd;
			area += cmd;
		}
		area += 'L' + scaleX(pd.points.length - 1, pd.points.length).toFixed(1) + ' ' + bottom + ' ';
		area += 'L' + scaleX(0, pd.points.length).toFixed(1) + ' ' + bottom + ' Z';
		return { area, line };
	}

	function buildXTicks(pd, w, imp) {
		if (pd.points.length <= 1) return [];
		const ticks = [];
		const startMile = pd.startIdx / 10;
		const endMile = pd.endIdx / 10;
		const rangeMiles = endMile - startMile;
		if (rangeMiles <= 0) return ticks;
		const range = imp ? rangeMiles : miToKm(rangeMiles);
		let step;
		if (imp) {
			if (range < 3) step = 0.5;
			else if (range < 10) step = 1;
			else if (range < 30) step = 5;
			else if (range < 100) step = 10;
			else if (range < 500) step = 50;
			else step = 100;
		} else {
			if (range < 5) step = 1;
			else if (range < 15) step = 2;
			else if (range < 50) step = 5;
			else if (range < 150) step = 20;
			else if (range < 800) step = 100;
			else step = 200;
		}
		const startVal = imp ? startMile : miToKm(startMile);
		const endVal = imp ? endMile : miToKm(endMile);
		const firstTick = Math.ceil(startVal / step) * step;
		const minPxGap = 30;
		for (let v = firstTick; v <= endVal + step * 0.01; v += step) {
			const mileVal = imp ? v : v / 1.60934;
			const localIdx = pd.endIdx > pd.startIdx
				? Math.round(((mileVal * 10 - pd.startIdx) / (pd.endIdx - pd.startIdx)) * (pd.points.length - 1))
				: 0;
			if (localIdx < 0 || localIdx >= pd.points.length) continue;
			const x = scaleX(localIdx, pd.points.length);
			if (ticks.length > 0 && x - ticks[ticks.length - 1].x < minPxGap) continue;
			const dec = step < 1 ? 1 : 0;
			ticks.push({ x, label: v.toFixed(dec) });
		}
		return ticks;
	}

	function buildYTicks(er, h, imp) {
		if (er.min === 0 && er.max === 0) return [];
		const ticks = [];
		const step = imp ? 1000 : 500;
		const firstTick = Math.ceil(er.min / step) * step;
		for (let v = firstTick; v <= er.max; v += step) {
			const y = scaleY(v, er.min, er.max);
			ticks.push({ y, label: v.toLocaleString('en-US') });
		}
		return ticks;
	}

	let cursorLocalIdx = -1;
	$: cursorX = cursorLocalIdx >= 0 ? scaleX(cursorLocalIdx, $profileData.points.length) : -1;
	$: cursorElevRaw = cursorLocalIdx >= 0 && cursorLocalIdx < $profileData.points.length
		? $profileData.points[cursorLocalIdx].elev
		: null;
	$: cursorElev = cursorElevRaw != null ? (imperial ? mToFt(cursorElevRaw) : cursorElevRaw) : null;
	$: cursorMile = cursorLocalIdx >= 0 && $profileData.points.length > 1 && $profileData.endIdx > $profileData.startIdx
		? ($profileData.startIdx + (cursorLocalIdx / ($profileData.points.length - 1)) * ($profileData.endIdx - $profileData.startIdx)) / 10
		: null;
	$: cursorDist = cursorMile != null ? (imperial ? cursorMile : miToKm(cursorMile)) : null;
	$: cursorLabel = cursorDist != null && cursorElev != null
		? cursorDist.toFixed(1) + (imperial ? 'mi' : 'km') + ' ' + Math.round(cursorElev).toLocaleString('en-US') + (imperial ? 'ft' : 'm')
		: '';

	function updateCursor(e) {
		if ($profileData.points.length <= 1) return;
		const rect = svgEl.getBoundingClientRect();
		const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
		const plotLeft = PADDING.left;
		const plotRight = width - PADDING.right;
		if (x < plotLeft || x > plotRight) {
			cursorLocalIdx = -1;
			oncursorupdate({ active: false });
			return;
		}
		const fraction = (x - plotLeft) / (plotRight - plotLeft);
		const newIdx = Math.max(0, Math.min($profileData.points.length - 1, Math.round(fraction * ($profileData.points.length - 1))));
		if (newIdx !== cursorLocalIdx) {
			cursorLocalIdx = newIdx;
			if ($profileData.points.length > 1 && $profileData.endIdx > $profileData.startIdx) {
				const trailIdx = $profileData.startIdx + Math.round(
					(cursorLocalIdx / ($profileData.points.length - 1)) * ($profileData.endIdx - $profileData.startIdx)
				);
				oncursorupdate({ active: true, trailIdx });
			}
		}
	}

	function handlePointerMove(e) {
		updateCursor(e);
	}

	function handlePointerDown(e) {
		updateCursor(e);
	}

	function handlePointerLeave() {
		cursorLocalIdx = -1;
		oncursorupdate({ active: false });
	}

	function handleClick() {
		// click already handled via pointerdown/pointermove which dispatch cursorupdate
	}

	function handleResize() {
		if (!containerEl) return;
		width = containerEl.clientWidth;
		height = containerEl.clientHeight;
	}

	onMount(() => {
		handleResize();
		if (typeof ResizeObserver !== 'undefined') {
			const ro = new ResizeObserver(() => handleResize());
			ro.observe(containerEl);
			return () => ro.disconnect();
		}
	});
	onMount(() => {
		const handler = (e) => {
			if (e.message === 'ResizeObserver loop completed with undelivered notifications.') {
				e.stopImmediatePropagation();
				e.preventDefault();
			}
		};
		window.addEventListener('error', handler);
		return () => window.removeEventListener('error', handler);
	});
</script>

<div class="elevation-profile-container" bind:this={containerEl}>
	{#if $profileData.points.length > 0 && width > 0 && height > 0}
		<svg
			bind:this={svgEl}
			{width}
			{height}
			onpointermove={handlePointerMove}
			onpointerdown={handlePointerDown}
			onpointerleave={handlePointerLeave}
			onclick={handleClick}
			class="elevation-profile-svg"
		>
			<path d={paths.area} fill={theme.areaFill} stroke="none" />
			<path d={paths.line} fill="none" stroke={theme.areaStroke} stroke-width="1.5" />

			<!-- y-axis grid lines + labels -->
			{#each yTicks as tick}
				<line x1={PADDING.left} y1={tick.y} x2={width - PADDING.right} y2={tick.y} stroke={theme.grid} stroke-width="0.5" />
				<text x={PADDING.left - 4} y={tick.y + 3} text-anchor="end" class="axis-label" fill={theme.axisLabel}>{tick.label}</text>
			{/each}

			<!-- x-axis tick marks + labels -->
			{#each xTicks as tick}
				<line x1={tick.x} y1={PADDING.top} x2={tick.x} y2={height - PADDING.bottom} stroke={theme.grid} stroke-width="0.5" />
				<line x1={tick.x} y1={height - PADDING.bottom} x2={tick.x} y2={height - PADDING.bottom + 4} stroke={theme.tick} stroke-width="1" />
				<text x={tick.x} y={height - PADDING.bottom + 14} text-anchor="middle" class="axis-label" fill={theme.axisLabel}>{tick.label}</text>
			{/each}

			<!-- y-axis tick marks -->
			{#each yTicks as tick}
				<line x1={PADDING.left - 4} y1={tick.y} x2={PADDING.left} y2={tick.y} stroke={theme.tick} stroke-width="1" />
			{/each}

			<!-- marker dots -->
			{#each visibleMarkers as m}
				{@const localIdx = $profileData.endIdx > $profileData.startIdx ? Math.round(((m.mile * 10) - $profileData.startIdx) / ($profileData.endIdx - $profileData.startIdx) * ($profileData.points.length - 1)) : 0}
				{#if localIdx >= 0 && localIdx < $profileData.points.length && m.elev != null}
					{@const elevConverted = imperial ? m.elev : ftToM(m.elev)}
					{@const selected = m.id === $selectedMarkerId}
					<circle
						cx={scaleX(localIdx, $profileData.points.length)}
						cy={scaleY(elevConverted, elevRange.min, elevRange.max)}
						r={selected ? 4 : 3}
						fill={ICON_COLORS[m.icon] || ICON_COLORS.o}
						stroke="white"
						stroke-width={selected ? 2 : 0.5}
					/>
				{/if}
			{/each}

			<!-- geo dot -->
			{#if geoDot}
				{@const geoElevConverted = imperial ? mToFt(geoDot.elev) : geoDot.elev}
				<circle
					cx={scaleX(geoDot.localIdx, $profileData.points.length)}
					cy={scaleY(geoElevConverted, elevRange.min, elevRange.max)}
					r="5"
					fill="#3b82f6"
					stroke="white"
					stroke-width="1.5"
				/>
			{/if}

			<!-- cursor -->
			{#if cursorLocalIdx >= 0 && cursorElev != null && cursorLabel}
				<line x1={cursorX} y1={PADDING.top} x2={cursorX} y2={height - PADDING.bottom} stroke="#d22" stroke-width="1" stroke-dasharray="3,2" />
				<circle cx={cursorX} cy={scaleY(cursorElev, elevRange.min, elevRange.max)} r="4" fill="#d22" stroke="white" stroke-width="1" />
				{@const labelW = cursorLabel.length * 5 + 8}
				<rect x={cursorX - labelW / 2} y={PADDING.top - 2} width={labelW} height="14" rx="2" fill="rgba(0,0,0,0.7)" />
				<text x={cursorX} y={PADDING.top + 9} text-anchor="middle" fill="white" class="cursor-label">{cursorLabel}</text>
			{/if}
		</svg>
	{:else}
		<div class="no-data">No trail visible in map window</div>
	{/if}
</div>

<style>
	.elevation-profile-container {
		width: 100%;
		height: 100%;
		overflow: hidden;
	}
	.elevation-profile-svg {
		display: block;
		cursor: crosshair;
		touch-action: none;
	}
	.axis-label {
		font-size: 9px;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
	}
	.cursor-label {
		font-size: 8px;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
	}
	.no-data {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		font-size: 0.875rem;
		color: #666;
	}
</style>
