<script>
	import { page } from '$app/stores';
	import { onMount, mount, unmount } from 'svelte';
	import { slide } from 'svelte/transition';
	import maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { Protocol, PMTiles } from 'pmtiles';
	import { OPFSSource } from '$lib/OPFSSource.js';
	import {
		settings,
		data,
		TRAILS,
		ICONS,
		renderedMarkers,
		detailId,
		editLocId,
		editLocNewMarker,
		openModal,
		modal,
		handleError,
		trailRoute,
		userMiles,
		elevationProfileVisible,
		profileData,
		selectedMarkerId,
		activeIcons,
		loadStatus,
		rulerMode,
		centerOnMarkerId,
		skipHistorySync
	} from '$lib/store.js';
	import { fetchWithProgress, haversine, formatRulerDist } from '$lib/helpers.js';
	import MarkerSlide from '$lib/MarkerSlide.svelte';
	import MarkerDetail from '$lib/MarkerDetail.svelte';
	import ElevationProfile from '$lib/ElevationProfile.svelte';
	import { goto, replaceState } from '$app/navigation';
	import { syncData, postGeneric, getData } from '$lib/api';
	import { db } from '$lib/db';
	import { get } from 'svelte/store';
	import { getOPFSFileSize } from '$lib/download.js';
	import { searchTrailRoute } from '$lib/helpers.js';
	import { decodeTrail } from '$lib/decode-trail.js';
	import * as Sentry from '@sentry/sveltekit';
	import { register } from 'swiper/element/bundle';
	register();
	import SwiperCore, { Virtual } from 'swiper';
	SwiperCore.use([Virtual]);

	const PHASES = {
		data: { start: 0, end: 20, msg: 'Loading trail data' },
		style: { start: 20, end: 35, msg: 'Loading map style' },
		canvas: { start: 35, end: 55, msg: 'Reticulating splines' },
		icons: { start: 55, end: 75, msg: 'Loading marker icons' },
		populate: { start: 75, end: 90, msg: 'Loading markers' },
		tiles: { start: 90, end: 100, msg: 'Loading map tiles' }
	};

	let fromBack = false;
	let prevOC = 0;
	$: oc = ($modal.isOpen ? 1 : 0) + ($detailId !== -1 ? 1 : 0);
	$: {
		if (oc > prevOC && !$skipHistorySync) history.pushState(history.state, '');
		else if (oc < prevOC && !fromBack && !$skipHistorySync) history.back();
		prevOC = oc;
	}
	$: if ($centerOnMarkerId >= 0 && mapInitialized) {
		const coords = $data.features[$centerOnMarkerId]?.geometry?.coordinates;
		if (coords) {
			map.flyTo({ center: coords, duration: 500 });
			updateSelectedMarker($centerOnMarkerId, true);
		}
		$centerOnMarkerId = -1;
	}

	let bootStartTime = 0;
	let tileBarActive = false;
	let tileLoadingTimer = null;
	let tileBarStartTime = 0;
	let tileLoadSucceeded = false;

	function setLoadPhase(phase, progressWithinPhase) {
		const p = PHASES[phase];
		if (!p) return;
		const fraction = Math.min(Math.max(progressWithinPhase, 0), 1);
		$loadStatus = {
			phase,
			message: p.msg,
			progress: Math.round(p.start + (p.end - p.start) * fraction),
			indeterminate: phase === 'tiles',
			error: false
		};
	}

	function setLoadError(message) {
		$loadStatus = {
			phase: 'error',
			message,
			progress: $loadStatus.progress,
			indeterminate: false,
			error: true
		};
	}

	let slotWrapper;
	let swiperEl;
	let showSwiper = false;
	let slideComponents = [];
	let profileMoveTimer = null;
	let cursorMapMarker = null;

	function updateProfileData() {
		if (!map || !mapInitialized || !$trailRoute.features) return;
		const bounds = map.getBounds();
		const coords = $trailRoute.features[0].geometry.coordinates;
		if (!coords || coords.length === 0) return;
		const sw = bounds.getSouthWest();
		const ne = bounds.getNorthEast();
		const minLng = sw.lng;
		const maxLng = ne.lng;
		const minLat = sw.lat;
		const maxLat = ne.lat;
		let startIdx = -1;
		let endIdx = -1;
		const step = coords.length > 10000 ? 10 : 1;
		for (let i = 0; i < coords.length; i += step) {
			const c = coords[i];
			if (c[0] >= minLng && c[0] <= maxLng && c[1] >= minLat && c[1] <= maxLat) {
				if (startIdx === -1) startIdx = i;
				endIdx = i;
			}
		}
		if (startIdx === -1) {
			$profileData = { points: [], startIdx: 0, endIdx: 0 };
			return;
		}
		if (step > 1) {
			const searchStart = Math.max(0, startIdx - step);
			const searchEnd = Math.min(coords.length - 1, endIdx + step);
			startIdx = -1;
			endIdx = -1;
			for (let i = searchStart; i <= searchEnd; i++) {
				const c = coords[i];
				if (c[0] >= minLng && c[0] <= maxLng && c[1] >= minLat && c[1] <= maxLat) {
					if (startIdx === -1) startIdx = i;
					endIdx = i;
				}
			}
		}
		if (startIdx === -1) {
			$profileData = { points: [], startIdx: 0, endIdx: 0 };
			return;
		}
		const visibleCount = endIdx - startIdx + 1;
		const chartWidthPx = document.getElementById('map')?.clientWidth || 400;
		const targetPoints = Math.min(visibleCount, Math.floor(chartWidthPx / 2));
		const dsStep = Math.max(1, Math.floor(visibleCount / targetPoints));
		const points = [];
		for (let i = startIdx; i <= endIdx; i += dsStep) {
			points.push({ elev: coords[i][2] || 0, mile: i / 10 });
		}
		if (points.length === 0 || points[points.length - 1].mile !== endIdx / 10) {
			points.push({ elev: coords[endIdx][2] || 0, mile: endIdx / 10 });
		}
		$profileData = { points, startIdx, endIdx };
	}

	function onMapMove() {
		if (profileMoveTimer) return;
		profileMoveTimer = setTimeout(() => {
			profileMoveTimer = null;
			updateProfileData();
			storeRenderedList();
		}, 100);
	}

	function onCursorUpdate(detail) {
		const { active, trailIdx } = detail;
		if (!active) {
			removeCursorMarker();
			return;
		}
		if (!$trailRoute.features) return;
		const coords = $trailRoute.features[0].geometry.coordinates;
		if (trailIdx < 0 || trailIdx >= coords.length) return;
		const lngLat = { lng: coords[trailIdx][0], lat: coords[trailIdx][1] };
		if (cursorMapMarker) {
			cursorMapMarker.setLngLat(lngLat);
		} else {
			const el = document.createElement('div');
			el.className = 'profile-cursor-marker';
			el.style.width = '12px';
			el.style.height = '12px';
			el.style.borderRadius = '50%';
			el.style.backgroundColor = '#d22';
			el.style.border = '2px solid white';
			el.style.boxShadow = '0 1px 3px rgba(0,0,0,0.4)';
			cursorMapMarker = new maplibregl.Marker({ element: el }).setLngLat(lngLat).addTo(map);
		}
	}

	function removeCursorMarker() {
		if (cursorMapMarker) {
			cursorMapMarker.remove();
			cursorMapMarker = null;
		}
	}

	let rulerA = null;
	let rulerB = null;
	let rulerLayersActive = false;
	let rulerZoomHandler = null;

	function removeRuler() {
		if (rulerZoomHandler && map) {
			map.off('zoomend', rulerZoomHandler);
			rulerZoomHandler = null;
		}
		if (!map) {
			rulerA = null;
			rulerB = null;
			rulerLayersActive = false;
			return;
		}
		if (rulerLayersActive) {
			if (map.getLayer('ruler-line')) map.removeLayer('ruler-line');
			if (map.getSource('ruler-line')) map.removeSource('ruler-line');
			if (map.getLayer('ruler-label')) map.removeLayer('ruler-label');
			if (map.getSource('ruler-label')) map.removeSource('ruler-label');
			rulerLayersActive = false;
		}
		if (rulerA) {
			rulerA.remove();
			rulerA = null;
		}
		if (rulerB) {
			rulerB.remove();
			rulerB = null;
		}
	}

	function createRulerPoint(lngLat) {
		const color = $settings.dark ? 'white' : 'black';
		const el = document.createElement('div');
		el.style.width = '40px';
		el.style.height = '40px';
		el.style.cursor = 'grab';
		const circle = document.createElement('div');
		circle.style.position = 'absolute';
		circle.style.top = '50%';
		circle.style.left = '50%';
		circle.style.transform = 'translate(-50%, -50%)';
		circle.style.width = '14px';
		circle.style.height = '14px';
		circle.style.borderRadius = '50%';
		circle.style.border = '2px solid ' + color;
		circle.style.boxShadow = '0 1px 3px rgba(0,0,0,0.4)';
		circle.style.background = 'radial-gradient(circle, ' + color + ' 2px, transparent 2px)';
		el.appendChild(circle);
		const marker = new maplibregl.Marker({ element: el, draggable: true })
			.setLngLat(lngLat)
			.addTo(map);
		marker.on('dragstart', () => {
			el.style.cursor = 'grabbing';
		});
		marker.on('dragend', () => {
			el.style.cursor = 'grab';
		});
		return marker;
	}

	function rulerBearingDeg(a, b) {
		const dLng = ((b[0] - a[0]) * Math.PI) / 180;
		const lat1 = (a[1] * Math.PI) / 180;
		const lat2 = (b[1] * Math.PI) / 180;
		const y = Math.sin(dLng) * Math.cos(lat2);
		const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
		return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
	}

	function updateRuler() {
		if (!rulerA || !rulerB || !map) {
			if (rulerLayersActive) {
				if (map.getLayer('ruler-line')) map.removeLayer('ruler-line');
				if (map.getSource('ruler-line')) map.removeSource('ruler-line');
				if (map.getLayer('ruler-label')) map.removeLayer('ruler-label');
				if (map.getSource('ruler-label')) map.removeSource('ruler-label');
				rulerLayersActive = false;
			}
			return;
		}
		const a = rulerA.getLngLat();
		const b = rulerB.getLngLat();
		const color = $settings.dark ? 'white' : 'black';
		const aCircle = rulerA.getElement().querySelector('div');
		const bCircle = rulerB.getElement().querySelector('div');
		if (aCircle) {
			aCircle.style.borderColor = color;
			aCircle.style.background = 'radial-gradient(circle, ' + color + ' 2px, transparent 2px)';
		}
		if (bCircle) {
			bCircle.style.borderColor = color;
			bCircle.style.background = 'radial-gradient(circle, ' + color + ' 2px, transparent 2px)';
		}
		const aPx = map.project([a.lng, a.lat]);
		const bPx = map.project([b.lng, b.lat]);
		const dxPx = bPx.x - aPx.x;
		const dyPx = bPx.y - aPx.y;
		const lenPx = Math.sqrt(dxPx * dxPx + dyPx * dyPx);
		const off = lenPx > 0 ? 7 / lenPx : 0;
		const aOffPx = { x: aPx.x + dxPx * off, y: aPx.y + dyPx * off };
		const bOffPx = { x: bPx.x - dxPx * off, y: bPx.y - dyPx * off };
		const aOff = map.unproject(aOffPx);
		const bOff = map.unproject(bOffPx);
		const lineFC = {
			type: 'FeatureCollection',
			features: [
				{
					type: 'Feature',
					geometry: {
						type: 'LineString',
						coordinates: [
							[aOff.lng, aOff.lat],
							[bOff.lng, bOff.lat]
						]
					},
					properties: {}
				}
			]
		};
		const bearDeg = rulerBearingDeg([a.lng, a.lat], [b.lng, b.lat]);
		const dist = haversine(a.lat, a.lng, b.lat, b.lng);
		const imp = $settings.units !== 'metric';
		const mid = [(a.lng + b.lng) / 2, (a.lat + b.lat) / 2];
		let textRot = bearDeg - 90;
		if (textRot > 180) textRot -= 360;
		if (textRot > 90) textRot -= 180;
		if (textRot < -90) textRot += 180;
		const labelFC = {
			type: 'FeatureCollection',
			features: [
				{
					type: 'Feature',
					geometry: { type: 'Point', coordinates: mid },
					properties: { distance: formatRulerDist(dist, imp) }
				}
			]
		};
		if (rulerLayersActive) {
			map.getSource('ruler-line').setData(lineFC);
			map.setPaintProperty('ruler-line', 'line-color', color);
			map.getSource('ruler-label').setData(labelFC);
			map.setLayoutProperty('ruler-label', 'text-rotate', textRot);
			map.setPaintProperty('ruler-label', 'text-color', color);
		} else {
			map.addSource('ruler-line', { type: 'geojson', data: lineFC });
			map.addLayer({
				id: 'ruler-line',
				type: 'line',
				source: 'ruler-line',
				paint: { 'line-color': color, 'line-width': 2, 'line-dasharray': [3, 2] }
			});
			map.addSource('ruler-label', { type: 'geojson', data: labelFC });
			map.addLayer({
				id: 'ruler-label',
				type: 'symbol',
				source: 'ruler-label',
				layout: {
					'text-field': ['get', 'distance'],
					'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
					'text-size': 13,
					'text-allow-overlap': true,
					'text-ignore-placement': true,
					'text-rotation-alignment': 'map',
					'text-keep-upright': false,
					'text-rotate': textRot,
					'text-anchor': 'center',
					'text-offset': [0.7, 0]
				},
				paint: {
					'text-color': color,
					'text-halo-color': $settings.dark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.7)',
					'text-halo-width': 2
				}
			});
			rulerLayersActive = true;
			if (!rulerZoomHandler) {
				rulerZoomHandler = () => updateRuler();
				map.on('zoomend', rulerZoomHandler);
			}
		}
	}

	let rulerUpdatePending = false;
	function onRulerMarkerDrag() {
		if (rulerUpdatePending) return;
		rulerUpdatePending = true;
		requestAnimationFrame(() => {
			rulerUpdatePending = false;
			updateRuler();
		});
	}

	function distPx(a, b) {
		return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
	}

	function onRulerClick(e) {
		if (!$rulerMode) return;
		if (rulerA && rulerB) {
			const pA = map.project(rulerA.getLngLat());
			const pB = map.project(rulerB.getLngLat());
			if (distPx(e.point, pA) < 25 || distPx(e.point, pB) < 25) return;
			removeRuler();
			rulerA = createRulerPoint(e.lngLat);
			rulerA.on('drag', onRulerMarkerDrag);
		} else if (!rulerA) {
			rulerA = createRulerPoint(e.lngLat);
			rulerA.on('drag', onRulerMarkerDrag);
		} else {
			rulerB = createRulerPoint(e.lngLat);
			rulerB.on('drag', onRulerMarkerDrag);
			updateRuler();
		}
	}

	function toggleRuler() {
		$rulerMode = !$rulerMode;
		if (!$rulerMode) removeRuler();
		if ($rulerMode && $selectedMarkerId !== -1) updateSelectedMarker(-1);
		if (map) map.getCanvas().style.cursor = $rulerMode ? 'crosshair' : '';
	}

	function toggleProfile() {
		$elevationProfileVisible = !$elevationProfileVisible;
		if ($elevationProfileVisible) {
			updateProfileData();
		}
		requestAnimationFrame(() => {
			if (map) {
				map.resize();
			}
		});
	}

	function isLastsyncStale() {
		const last = get(settings).lastsync;
		if (!last || !last.isValid?.()) return true;
		return Date.now() - last.valueOf() > 3600000;
	}

	onMount(async () => {
		if (document.wasDiscarded) Sentry.metrics.count('client.page.was_discarded', 1);
		window.addEventListener('popstate', () => {
			fromBack = true;
			if ($detailId !== -1) $detailId = -1;
			else if ($modal.isOpen) {
				$modal.isOpen = false;
				$modal.cancel();
			}
			setTimeout(() => (fromBack = false), 0);
		});
		const preBar = document.getElementById('pre-hydrate-bar');
		if (preBar) preBar.remove();
		bootStartTime = Date.now();
		$loadStatus = {
			phase: 'data',
			message: PHASES.data.msg,
			progress: 0,
			indeterminate: false,
			error: false
		};
		const viewport = document.querySelector('meta[name="viewport"]');
		function updateViewport() {
			if (!viewport) return;
			const allowZoom = $detailId !== -1 || $page.url.pathname !== '/app';
			viewport.content = allowZoom
				? 'width=device-width, initial-scale=1'
				: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no';
		}
		detailId.subscribe(updateViewport);
		page.subscribe(updateViewport);
		page.subscribe(() => {
			if ($page.url.pathname !== '/app' && $rulerMode) {
				$rulerMode = false;
				removeRuler();
				if (map) map.getCanvas().style.cursor = '';
			}
		});
		const params = $page.url.searchParams;
		const deepTrail = params.get('trail');
		const deepMarkerDbid = params.get('marker');
		if (deepTrail && TRAILS[deepTrail]) {
			$settings.trail = deepTrail;
		}
		if (!Object.keys(TRAILS).includes($settings.trail)) goto('/');
		try {
			if ($settings.autosync && navigator.onLine && isLastsyncStale()) {
				await syncData();
				setLoadPhase('data', 1);
			} else {
				await getData();
				setLoadPhase('data', 1);
			}
			await initializeMap();
		} catch (err) {
			setLoadError(err.message || 'Load failed');
			handleError(err, { modal: true, sentry: true });
		}
		if ($settings.offline) {
			const size = await getOPFSFileSize($settings.trail);
			if (!size) $settings.offline = false;
		}
		if (deepMarkerDbid) {
			const idx = $data.features.findIndex((f) => f.properties.dbid == deepMarkerDbid);
			if (idx !== -1) {
				updateSelectedMarker(idx, true);
				$detailId = idx;
			}
			replaceState('/app', {});
		}
		if ($settings.autosync) {
			window.addEventListener('online', async () => {
				Sentry.metrics.count('client.network.online', 1);
				if (get(settings).autosync && (isLastsyncStale() || (await db.pending.count()))) syncData();
			});
		}
		document.addEventListener('visibilitychange', () => {
			if (document.visibilityState !== 'visible' || !map) return;
			const gl = map.painter?.context?.gl;
			if (!gl || gl.isContextLost()) {
				Sentry.metrics.count('client.webgl.context_lost_silent', 1);
				Sentry.addBreadcrumb({
					category: 'webgl',
					message: 'Silent WebGL context loss detected on visibilitychange'
				});
				recreateMap();
			} else {
				map.resize();
			}
		});
		document.addEventListener('freeze', () => {
			Sentry.metrics.count('client.page.frozen', 1);
			Sentry.addBreadcrumb({ category: 'lifecycle', message: 'Page frozen by browser' });
		});
		document.addEventListener('resume', () => {
			Sentry.metrics.count('client.page.resumed', 1);
			Sentry.addBreadcrumb({ category: 'lifecycle', message: 'Page resumed from freeze' });
			if (map) {
				const gl = map.painter?.context?.gl;
				if (!gl || gl.isContextLost()) {
					Sentry.metrics.count('client.webgl.context_lost_on_resume', 1);
					Sentry.addBreadcrumb({
						category: 'webgl',
						message: 'WebGL context lost detected on resume'
					});
					recreateMap();
				}
			}
		});
	});

	let filteredIdx;
	let prevActiveIcons;
	$: updateFilteredIdx($activeIcons, $data);
	function updateFilteredIdx() {
		if (prevActiveIcons !== undefined && $activeIcons.some((v, i) => v !== prevActiveIcons[i])) {
			updateSelectedMarker(-1);
		}
		prevActiveIcons = [...$activeIcons];
		filteredIdx = $data.features.reduce((acc, curr, idx) => {
			for (const char of curr.properties.icons) {
				if ($activeIcons[ICONS.indexOf(char)]) {
					acc.push(idx);
					break;
				}
			}
			return acc;
		}, []);
	}

	const iconLayers = ['markers'];
	function sortFeatures(data) {
		data.features.sort(
			(a, b) => a.properties.commentCount - b.properties.commentCount || Math.random() - 0.5
		);
		return data;
	}
	let filtersVisible = false;
	let lastToggleAllIcons = true;
	function toggleIconLayer(i) {
		$activeIcons[i] = !$activeIcons[i];
		$activeIcons = $activeIcons;
		updateMarkerFilter();
	}
	function toggleAllIcons() {
		lastToggleAllIcons = !lastToggleAllIcons;
		$activeIcons = $activeIcons.fill(lastToggleAllIcons);
		updateMarkerFilter();
	}
	function toggleFilters() {
		filtersVisible = !filtersVisible;
		if (!filtersVisible) {
			$activeIcons = new Array(ICONS.length).fill(true);
			lastToggleAllIcons = true;
			updateMarkerFilter();
		}
	}
	function updateMarkerFilter() {
		const active = ICONS.filter((_, i) => $activeIcons[i]);
		map.setFilter('markers', ['in', ['get', 'icon'], ['literal', active]]);
		for (const icon of ICONS) {
			map.setLayoutProperty(
				`markers-${icon}-selected`,
				'visibility',
				$activeIcons[ICONS.indexOf(icon)] ? 'visible' : 'none'
			);
		}
	}

	let map;
	let mapInitialized = false;
	let mapRecreating = false;
	$: if (mapInitialized)
		map.getSource('markers')?.setData(sortFeatures({ ...$data, features: [...$data.features] }));

	/** @type {import('pmtiles').Protocol | undefined} */
	let pmtilesProtocol;

	let compositeLayerIds = [];

	let pmtilesUpdateInProgress = false;

	async function updatePmtilesSource() {
		if (!pmtilesProtocol || pmtilesUpdateInProgress) return;
		pmtilesUpdateInProgress = true;
		try {
			const key = `https://cdn.opentrail.org/${$settings.trail}.pmtiles`;
			for (const existingKey of [...pmtilesProtocol.tiles.keys()]) {
				if (existingKey !== key) pmtilesProtocol.tiles.delete(existingKey);
			}
			if ($settings.offline && (await getOPFSFileSize($settings.trail))) {
				pmtilesProtocol.add(new PMTiles(new OPFSSource($settings.trail)));
			} else {
				pmtilesProtocol.tiles.delete(key);
				if ($settings.offline) $settings.offline = false;
			}
		} finally {
			pmtilesUpdateInProgress = false;
		}
	}

	async function initializeMap() {
		if (!document.getElementById('map') || !slotWrapper) return setTimeout(initializeMap, 10);

		if (!pmtilesProtocol) {
			pmtilesProtocol = new Protocol();
			maplibregl.addProtocol('pmtiles', pmtilesProtocol.tile);
		}
		await updatePmtilesSource();

		setLoadPhase('style', 0);
		const styleRes = await fetchWithProgress('https://cdn.opentrail.org/style-outdoors.json', (p) =>
			setLoadPhase('style', p)
		);
		const style = await styleRes.json();
		style.sources.composite = {
			type: 'vector',
			url: `pmtiles://https://cdn.opentrail.org/${$settings.trail}.pmtiles`
		};
		compositeLayerIds = style.layers.map((l) => l.id);

		map = new maplibregl.Map({
			container: 'map',
			style: style,
			bounds: TRAILS[$settings.trail].bounds,
			minZoom: 2,
			attributionControl: false
		});
		map.dragRotate.disable();
		map.touchZoomRotate.disableRotation();
		map.addControl(new maplibregl.NavigationControl({ showCompass: false }));
		const geolocate = new maplibregl.GeolocateControl({
			positionOptions: {
				enableHighAccuracy: true
			},
			trackUserLocation: true
		});

		//maplibre doesn't supply a heading indicator... :/
		const el = document.createElement('div');
		el.innerHTML =
			'<svg width="16" height="16" viewBox="0 0 24 24" fill="#1CA1F3" style="display:block;margin:0 auto"><path d="M12 2l8 16H4z"/></svg>';
		el.style.width = '46px';
		el.style.height = '46px';
		el.style.display = 'flex';
		el.style.alignItems = 'flex-start';
		el.style.justifyContent = 'center';
		const headingMarker = new maplibregl.Marker({ element: el });
		let compassEnabled = false;
		let compassDisabled = false;
		let lastHeading;
		let orientationEvent;
		let disableTimeout;
		const disableCompass = () => {
			compassEnabled = false;
			headingMarker.remove();
			window.removeEventListener(orientationEvent, compassListener, true);
		};
		const compassListener = (e) => {
			if (!compassEnabled) {
				headingMarker.addTo(map);
				compassEnabled = true;
			}
			let heading = e.webkitCompassHeading || 360 - e.alpha;
			heading = Math.round(heading / 3) * 3;
			if (lastHeading === heading) return;
			else lastHeading = heading;
			headingMarker.setRotation(heading);
		};
		geolocate.on('trackuserlocationstart', () => {
			Sentry.metrics.count('client.geolocate.enabled', 1, { tags: { trail: $settings.trail } });
			clearTimeout(disableTimeout);
		});
		geolocate.on('trackuserlocationend', () => {
			disableTimeout = setTimeout(disableCompass, 300);
		});
		function attachCompassListener() {
			if (compassDisabled || !window.DeviceOrientationEvent) return;
			const isIOS =
				navigator.userAgent.match(/(iPod|iPhone|iPad)/) && navigator.userAgent.match(/AppleWebKit/);
			if (isIOS) {
				console.log('Starting iOS compass marker');
				orientationEvent = 'deviceorientation';
				if (typeof DeviceOrientationEvent.requestPermission === 'function') {
					DeviceOrientationEvent.requestPermission()
						.then((response) => {
							if (response === 'granted')
								window.addEventListener(orientationEvent, compassListener, true);
						})
						.catch(() => {
							openModal({
								type: 'iOSCompass',
								submit: () => {
									$modal.isOpen = false;
									DeviceOrientationEvent.requestPermission().then((response) => {
										if (response === 'granted')
											window.addEventListener(orientationEvent, compassListener, true);
										else compassDisabled = true;
									});
								},
								cancel: () => {
									$modal.isOpen = false;
									compassDisabled = true;
								}
							});
						});
				} else {
					window.addEventListener(orientationEvent, compassListener, true);
				}
			} else {
				console.log('Starting Android compass marker');
				orientationEvent = 'deviceorientationabsolute';
				window.addEventListener(orientationEvent, compassListener, true);
			}
		}
		geolocate.on('geolocate', function (geo) {
			if (new Date() - $userMiles.date > 60000) {
				Sentry.metrics.count('client.geolocate.mile_search', 1, {
					tags: { trail: $settings.trail }
				});
				//limit the mile search algo to once per minute
				$userMiles.date = new Date();
				const min = searchTrailRoute(geo.coords.longitude, geo.coords.latitude, $trailRoute, 1);
				$userMiles.miles = min.index / 10;
				console.log($userMiles.miles);
			}
			headingMarker.setLngLat([geo.coords.longitude, geo.coords.latitude]);
			if (!compassEnabled && !compassDisabled) attachCompassListener();
		});
		map.addControl(geolocate);

		map.on('click', (e) => {
			if ($rulerMode) {
				onRulerClick(e);
				return;
			}
			if (
				map.queryRenderedFeatures(e.point).findIndex((el) => el.layer.source === 'markers') === -1
			) {
				updateSelectedMarker(-1);
				removeCursorMarker();
			}
		});

		map.on('error', (e) => {
			Sentry.metrics.count('client.map.error', 1);
			const err = e.error || new Error(`Map: ${JSON.stringify(e.error)}`);
			handleError(err, { modal: false, sentry: true });
			setLoadError('Map load error');
		});
		setLoadPhase('canvas', 0);
		await new Promise((resolve) => map.once('load', resolve));
		setLoadPhase('canvas', 1);

		setLoadPhase('icons', 0);
		let iconsLoaded = 0;
		const totalIcons = ICONS.length * 2;
		for (const icon of ICONS) {
			await addImageToMap(icon);
			iconsLoaded++;
			setLoadPhase('icons', iconsLoaded / totalIcons);
			await addImageToMap(icon + '-selected');
			iconsLoaded++;
			setLoadPhase('icons', iconsLoaded / totalIcons);
		}
		await populateMap();

		const canvases = document.getElementsByTagName('canvas');
		if (canvases.length > 1)
			handleError(new Error('Multiple map canvases detected'), { modal: false, sentry: true });

		map.on('webglcontextlost', () => {
			Sentry.metrics.count('client.webgl.context_lost', 1);
			Sentry.addBreadcrumb({ category: 'webgl', message: 'WebGL context lost' });
		});
		map.on('webglcontextrestored', async () => {
			Sentry.metrics.count('client.webgl.context_restored', 1);
			Sentry.addBreadcrumb({
				category: 'webgl',
				message: 'WebGL context restored — rebuilding map sources'
			});
			try {
				await rebuildMapSources();
			} catch (err) {
				handleError(err, { modal: true, sentry: true });
			}
		});

		map.on('sourcedata', (e) => {
			if (e.sourceId === 'composite' && e.isSourceLoaded) tileLoadSucceeded = true;
		});

		map.on('dataloading', () => {
			tileLoadSucceeded = false;
			if (!tileLoadingTimer && !tileBarActive) {
				tileLoadingTimer = setTimeout(() => {
					tileLoadingTimer = null;
					if ($loadStatus.error) return;
					tileBarActive = true;
					tileBarStartTime = Date.now();
					setLoadPhase('tiles', 0);
				}, 3000);
			}
		});
		map.on('idle', () => {
			clearTimeout(tileLoadingTimer);
			tileLoadingTimer = null;
			if (bootStartTime > 0) {
				Sentry.metrics.distribution('client.boot.duration_ms', Date.now() - bootStartTime, {
					tags: { trail: $settings.trail }
				});
				bootStartTime = 0;
			}
			if ($loadStatus.error && !tileLoadSucceeded) return;
			if (tileBarActive) {
				tileBarActive = false;
				const elapsed = Date.now() - tileBarStartTime;
				const hideDelay = Math.max(0, 500 - elapsed);
				setTimeout(() => {
					$loadStatus = {
						phase: 'idle',
						message: '',
						progress: 100,
						indeterminate: false,
						error: false
					};
				}, hideDelay);
			} else if ($loadStatus.phase !== 'idle') {
				$loadStatus = {
					phase: 'idle',
					message: '',
					progress: 100,
					indeterminate: false,
					error: false
				};
			}
		});
	}

	function onMarkerClick(e) {
		if ($rulerMode) return;
		updateSelectedMarker(e.features[0].id);
	}

	async function populateMap() {
		setLoadPhase('populate', 0);
		const res = await fetchWithProgress(
			`https://cdn.opentrail.org/${$settings.trail}.json`,
			() => {}
		);
		$trailRoute = decodeTrail(await res.json());
		map.addSource('route', {
			type: 'geojson',
			data: $trailRoute
		});
		map.addLayer({
			id: 'route',
			type: 'line',
			source: 'route',
			paint: {
				'line-color': '#d22',
				'line-width': 3
			}
		});
		map.addSource('markers', {
			type: 'geojson',
			data: sortFeatures({ ...$data, features: [...$data.features] })
		});
		const markerLayout = {
			'symbol-z-order': 'source',
			'icon-size': 0.5,
			'icon-allow-overlap': true,
			'text-field': ['get', 'title'],
			'text-size': 12,
			'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
			'text-optional': true,
			'text-ignore-placement': true,
			'text-offset': [0, 0.85],
			'text-anchor': 'top'
		};
		map.addLayer({
			id: 'markers',
			type: 'symbol',
			source: 'markers',
			layout: {
				'icon-image': ['get', 'icon'],
				...markerLayout
			},
			paint: {
				'icon-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0, 1]
			}
		});
		map.on('click', 'markers', onMarkerClick);
		for (const icon of ICONS) {
			map.addLayer({
				id: `markers-${icon}-selected`,
				type: 'symbol',
				source: 'markers',
				layout: {
					'icon-image': ['concat', ['get', 'icon'], '-selected'],
					...markerLayout
				},
				paint: {
					'icon-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 1, 0]
				},
				filter: ['in', icon, ['get', 'icons']]
			});
		}
		mapInitialized = true;
		updateMarkerFilter();
		map.off('move', onMapMove);
		map.on('move', onMapMove);
		updateProfileData();
		setLoadPhase('populate', 1);
		map.once('idle', () => {
			storeRenderedList();
		});
	}

	async function rebuildMapSources() {
		if (!map || mapRecreating) return;
		mapInitialized = false;
		bootStartTime = Date.now();
		removeRuler();

		map.removeLayer('markers');
		map.off('click', 'markers', onMarkerClick);
		for (const icon of ICONS) {
			map.removeLayer(`markers-${icon}-selected`);
		}
		map.removeSource('markers');
		map.removeLayer('route');
		map.removeSource('route');

		for (const id of compositeLayerIds) {
			if (map.getLayer(id)) map.removeLayer(id);
		}
		if (map.getSource('composite')) map.removeSource('composite');

		await updatePmtilesSource();
		const wasOffline = $settings.offline;
		map.addSource('composite', {
			type: 'vector',
			url: `pmtiles://https://cdn.opentrail.org/${$settings.trail}.pmtiles`
		});
		if (!wasOffline && !navigator.onLine) {
			handleError(
				new Error('No offline data for this trail. Connect to the internet to load map tiles.'),
				{ modal: true, sentry: true, tags: { transient: true } }
			);
		}
		setLoadPhase('style', 0);
		const styleRes = await fetchWithProgress('https://cdn.opentrail.org/style-outdoors.json', (p) =>
			setLoadPhase('style', p)
		);
		const style = await styleRes.json();
		const compositeLayers = style.layers.filter((l) => l.source === 'composite');
		for (const layer of compositeLayers) {
			map.addLayer(layer);
		}
		compositeLayerIds = compositeLayers.map((l) => l.id);

		await populateMap();
		tileBarActive = false;
		tileLoadSucceeded = false;
		clearTimeout(tileLoadingTimer);
		tileLoadingTimer = null;
	}

	async function recreateMap() {
		if (!map || mapRecreating) return;
		mapRecreating = true;
		removeRuler();
		Sentry.metrics.count('client.map.recreated', 1);
		Sentry.addBreadcrumb({
			category: 'lifecycle',
			message: 'Recreating map due to dead WebGL context'
		});
		const center = map.getCenter();
		const zoom = map.getZoom();
		map.remove();
		map = null;
		mapInitialized = false;
		compositeLayerIds = [];
		cursorMapMarker = null;
		clearTimeout(tileLoadingTimer);
		tileLoadingTimer = null;
		tileBarActive = false;
		tileLoadSucceeded = false;
		profileMoveTimer = null;
		try {
			await initializeMap();
			map.setCenter(center);
			map.setZoom(zoom);
		} catch (err) {
			handleError(err, { modal: true, sentry: true });
		} finally {
			mapRecreating = false;
		}
	}

	async function changeTrailOnMap() {
		if (!map || !mapInitialized || mapRecreating) return;
		$activeIcons = new Array(ICONS.length).fill(true);
		lastToggleAllIcons = true;

		await rebuildMapSources();
		map.fitBounds(TRAILS[$settings.trail].bounds);
	}

	let currentTrail = $settings.trail;
	$: if (mapInitialized) {
		$settings.offline;
		$settings.trail;
		if ($settings.trail !== currentTrail) {
			Sentry.metrics.count('client.trail_changed', 1, {
				tags: { from: currentTrail, to: $settings.trail }
			});
			currentTrail = $settings.trail;
			changeTrailOnMap();
		} else {
			updatePmtilesSource();
		}
	}

	function updateSelectedMarker(id, slide = true) {
		if (!mapInitialized) return;
		if (lockSelection) return;
		if ($selectedMarkerId === id) return;
		if ($selectedMarkerId !== -1)
			map.setFeatureState({ source: 'markers', id: $selectedMarkerId }, { selected: false });
		if (id !== -1) map.setFeatureState({ source: 'markers', id: id }, { selected: true });
		else {
			for (const comp of slideComponents) unmount(comp);
			slideComponents = [];
			showSwiper = false;
		}
		if (slide && swiperEl && id >= 0) swiperSlide(id, false);
		$selectedMarkerId = id;
	}
	$: if (swiperEl) swiperSlide();
	function swiperSlide(id = $selectedMarkerId, init = true) {
		const swiperParams = {
			virtual: {
				slides: filteredIdx,
				renderExternal: (d) => {
					for (const comp of slideComponents) unmount(comp);
					slideComponents = [];
					const activeIdx = swiperEl.swiper.activeIndex;
					for (let i = d.from; i <= d.to; i++) {
						slideComponents.push(
							mount(MarkerSlide, {
								target: swiperEl,
								props: {
									index: filteredIdx[i],
									offset: d.offset,
									onPrev: i === activeIdx && i > 0 ? () => swiperEl.swiper.slidePrev() : undefined,
									onNext:
										i === activeIdx && i < filteredIdx.length - 1
											? () => swiperEl.swiper.slideNext()
											: undefined
								}
							})
						);
					}
				}
			}
		};
		Object.assign(swiperEl, swiperParams);
		if (init) swiperEl.initialize();

		swiperEl.swiper.slideTo(filteredIdx.indexOf(id), init ? 0 : 150, false);
		if (init) showSwiper = true;
	}

	async function addImageToMap(name) {
		const { data: image } = await map.loadImage(`https://cdn.opentrail.org/icons/${name}.png`);
		map.addImage(name, image);
	}

	function newMarker() {
		Sentry.metrics.count('client.new_marker.opened', 1);
		let prop = { images: [] };
		openModal({
			type: 'text',
			data: ['Marker title', ''],
			submit: (title) => {
				prop.title = title[1];
				openModal({
					type: 'textAreaWithComment',
					data: ['Marker description', '', ''],
					submit: (desc) => {
						prop.desc = desc[1];
						prop.comment = desc[2];
						openModal({
							type: 'editIcons',
							submit: (icons) => {
								prop.icon = icons[0];
								prop.icons = icons;
								const latlng = map.getCenter();
								const feature = {
									type: 'Feature',
									geometry: {
										type: 'Point',
										coordinates: [latlng.lng, latlng.lat]
									},
									properties: prop,
									id: $data.features.length
								};
								console.log(feature);
								$data.features.push(feature);
								$editLocId = feature.id;
								$editLocNewMarker = true;
							}
						});
					}
				});
			}
		});
	}
	let lockSelection = false;
	$: if ($editLocId !== -1) {
		$detailId = -1;
		updateSelectedMarker($editLocId);
		lockSelection = true;
		editMarkerLoc($editLocNewMarker);
		$editLocId = -1;
	}
	let editLayerId = null;
	let editFeatureProps = null;
	let editCoords = null;
	function editMarkerLoc(newMarker) {
		const feature = $data.features[$selectedMarkerId];
		const oldCoordCopy = [...feature.geometry.coordinates];
		editFeatureProps = { ...feature.properties };
		const latlng = map.getCenter();
		editCoords = [latlng.lng, latlng.lat];
		const editFeature = {
			type: 'Feature',
			geometry: { type: 'Point', coordinates: [latlng.lng, latlng.lat] },
			properties: { ...feature.properties },
			id: 'edit'
		};
		map.addSource('editMarker', {
			type: 'geojson',
			data: { type: 'FeatureCollection', features: [editFeature] }
		});
		const icons = feature.properties.icons || [feature.properties.icon];
		editLayerId = `markers-${icons[0]}-selected`;
		map.addLayer(
			{
				id: 'editMarker',
				type: 'symbol',
				source: 'editMarker',
				layout: {
					'icon-image': ['concat', ['get', 'icon'], '-selected'],
					'icon-size': 0.5,
					'icon-allow-overlap': true,
					'text-field': ['get', 'title'],
					'text-size': 12,
					'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
					'text-optional': true,
					'text-ignore-placement': true,
					'text-offset': [0, 0.85],
					'text-anchor': 'top'
				}
			},
			editLayerId
		);
		map.setFeatureState({ source: 'markers', id: feature.id }, { selected: false });
		openModal({
			type: 'editLoc',
			cancel: () => {
				map.off('move', editMarkerLocOnMove);
				removeEditLayer();
				if (newMarker) {
					updateSelectedMarker(-1);
					$data.features.pop();
					$data = $data;
				} else {
					feature.geometry.coordinates = oldCoordCopy;
					$data = $data;
					updateSelectedMarker(feature.id);
				}
				lockSelection = false;
			},
			submit: async () => {
				map.off('move', editMarkerLocOnMove);
				feature.geometry.coordinates = [...editCoords];
				removeEditLayer();
				lockSelection = false;
				if (newMarker) {
					updateSelectedMarker(-1);
					$data.features.pop();
					$data = $data;
					await postGeneric({
						route: 'postMarker?type=newMarker',
						data: {
							lat: editCoords[1],
							lng: editCoords[0],
							title: feature.properties.title,
							desc: feature.properties.desc,
							comment: feature.properties.comment,
							icons: feature.properties.icons,
							trail: $settings.trail
						}
					});
				} else {
					$data = $data;
					await postGeneric({
						route: 'postMarker?type=editLoc',
						data: {
							dbid: feature.properties.dbid,
							lat: editCoords[1],
							lng: editCoords[0],
							trail: $settings.trail
						}
					});
				}
			}
		});
		map.on('move', editMarkerLocOnMove);
	}
	function removeEditLayer() {
		if (map.getLayer('editMarker')) map.removeLayer('editMarker');
		if (map.getSource('editMarker')) map.removeSource('editMarker');
		editLayerId = null;
	}
	function editMarkerLocOnMove() {
		const c = map.getCenter();
		editCoords = [c.lng, c.lat];
		map.getSource('editMarker').setData({
			type: 'FeatureCollection',
			features: [
				{
					type: 'Feature',
					geometry: { type: 'Point', coordinates: editCoords },
					properties: editFeatureProps,
					id: 'edit'
				}
			]
		});
	}

	function onSlideChange(e) {
		if (!mapInitialized) return;
		const id = filteredIdx[e.detail[0].activeIndex];
		updateSelectedMarker(id, false);
		const mapEl = map.getContainer();
		const swiperTop = swiperEl.getBoundingClientRect().top - mapEl.getBoundingClientRect().top;
		const isCurrentlyRendered = map.queryRenderedFeatures(
			[
				[0, 0],
				[mapEl.clientWidth, swiperTop]
			],
			{ layers: iconLayers, filter: ['==', ['id'], id] }
		);
		if (isCurrentlyRendered.length === 0)
			map.flyTo({
				center: $data.features[id].geometry.coordinates,
				duration: 500
			});
	}

	function navigateDetail(id) {
		updateSelectedMarker(id, true);
		$detailId = id;
	}

	function getDetailNavProps() {
		const pos = filteredIdx.indexOf($detailId);
		return {
			onPrev: pos > 0 ? () => navigateDetail(filteredIdx[pos - 1]) : undefined,
			onNext: pos < filteredIdx.length - 1 ? () => navigateDetail(filteredIdx[pos + 1]) : undefined
		};
	}

	function storeRenderedList() {
		if (!mapInitialized) return;
		$renderedMarkers = map.queryRenderedFeatures({ layers: iconLayers }).map((val) => val.id);
		$renderedMarkers = [...new Set($renderedMarkers)]; //remove duplicates
		$renderedMarkers.sort((a, b) => a - b); //js is special
	}
</script>

<div class="flex flex-col h-full">
	<!-- loading indicator -->
	{#if $loadStatus.phase !== 'idle'}
		<div
			class="load-indicator"
			class:load-indicator-error={$loadStatus.error}
			style="--bar-color: #333; --bar-error: #d7230e;"
		>
			<div class="load-bar-track">
				<div
					class="load-bar-fill"
					class:load-bar-indeterminate={$loadStatus.indeterminate}
					style="width: {$loadStatus.progress}%;"
				></div>
			</div>
			<div class="load-bar-text" style="color: #666;">
				{$loadStatus.message}{#if $loadStatus.error}
					<button onclick={() => window.location.reload()} class="retry-btn">Retry</button>{/if}
			</div>
		</div>
	{/if}
	<!-- main area full height minus navbar, use grid to overlap divs + css "visibility" to cache map for fast navigation -->
	<div style="height: calc(100dvh - 64px);" class="grid grid-cols-1 grid-rows-1">
		<!-- hide the map when visiting other routes -->
		<div
			style="visibility: {$page.url.pathname === '/app' ? 'visible' : 'hidden'};"
			class="row-start-1 col-start-1 relative flex flex-col"
		>
			<div id="map" class="flex-1 w-full min-h-0">
				<div class="map-attribution">
					&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>
				</div>
			</div>
			<!-- elevation profile overlay -->
			{#if $elevationProfileVisible}
				<div
					class="elevation-profile-overlay"
					style="background: {$settings.dark
						? '#1e1e1e'
						: 'white'}; border-top: 1px solid {$settings.dark ? '#444' : '#ddd'};"
				>
					<ElevationProfile oncursorupdate={onCursorUpdate} />
				</div>
			{/if}
			<!-- filter funnel + collapsible filter icons -->
			<div class="absolute top-32 right-2 flex flex-col items-stretch">
				<button
					class="btn btn-circle btn-sm bg-white focus:bg-white active:bg-white border-opacity-50 filter-funnel-btn"
					class:filter-funnel-open={filtersVisible}
					class:filter-funnel-active={filtersVisible}
					onclick={toggleFilters}
				>
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="#333333"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"><path d="M3 4h18l-7 8.5V18l-4 2v-7.5L3 4z" /></svg
					>
				</button>
				{#if filtersVisible}
					<div in:slide={{ duration: 200 }} out:slide={{ duration: 200 }}>
						<div class="btn-group btn-group-vertical filter-bar-inner">
							<button
								class="btn btn-circle btn-sm bg-white focus:bg-white active:bg-white border-opacity-50"
								onclick={toggleAllIcons}
							>
								<img
									src={'https://cdn.opentrail.org/icons/select-all.png'}
									height="20px"
									width="20px"
								/>
							</button>
							{#each ICONS as icon, i}
								<button
									class="btn btn-circle btn-sm bg-white focus:bg-white active:bg-white border-opacity-50"
									class:opacity-40={!$activeIcons[i]}
									onclick={() => toggleIconLayer(i)}
								>
									<img src={`https://cdn.opentrail.org/icons/${icon}.png`} />
								</button>
							{/each}
						</div>
					</div>
				{/if}
			</div>
			<!-- profile toggle button -->
			<button
				class="absolute left-[calc(50%-16px)] btn btn-circle btn-sm bg-base-100 focus:bg-base-100 active:bg-base-100 border-opacity-50 text-base-content"
				style="bottom: {$elevationProfileVisible ? 'calc(25% - 14px)' : '8px'}; z-index: 1;"
				onclick={toggleProfile}
				title={$elevationProfileVisible ? 'Hide elevation profile' : 'Show elevation profile'}
			>
				{#if $elevationProfileVisible}
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"><path d="M6 9l6 6 6-6" /></svg
					>
				{:else}
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"><path d="M2 20L8 10L14 14L22 4" /></svg
					>
				{/if}
			</button>
			<!-- detail modal -->
			{#if $detailId !== -1}
				<MarkerDetail {...getDetailNavProps()} />
			{/if}
			<!-- swiper or new marker button -->
			{#if $selectedMarkerId !== -1}
				<swiper-container
					class="absolute w-full h-40"
					style="bottom: {$elevationProfileVisible
						? 'calc(25% + 8px)'
						: '8px'}; z-index: 2; visibility: {$detailId === -1 && showSwiper
						? 'inherit'
						: 'hidden'};"
					slides-per-view={1.15}
					space-between={15}
					centered-slides={true}
					speed={150}
					onslidechange={onSlideChange}
					bind:this={swiperEl}
					init={false}
				></swiper-container>
			{:else}
				<button
					class="absolute left-2 btn btn-circle btn-sm bg-base-100 focus:bg-base-100 active:bg-base-100 border-opacity-50 text-base-content"
					class:ruler-btn-active={$rulerMode}
					style="bottom: {$elevationProfileVisible ? 'calc(25% + 52px)' : '44px'};"
					onclick={toggleRuler}
					title="Ruler"
				>
					<svg
						width="20"
						height="20"
						viewBox="0 0 20 20"
						fill="currentColor"
						stroke="currentColor"
						stroke-width="0.5"
						xmlns="http://www.w3.org/2000/svg"
						><path
							fill-rule="evenodd"
							clip-rule="evenodd"
							d="M2.31 13.626a.5.5 0 0 0 0 .708l3.536 3.535a.5.5 0 0 0 .707 0L17.867 6.555a.5.5 0 0 0 0-.707l-3.536-3.535a.5.5 0 0 0-.707 0l-1.06 1.06 1.709 1.71a.5.5 0 1 1-.708.706L11.857 4.08l-1.415 1.415.884.884a.5.5 0 0 1-.707.707l-.884-.884-1.414 1.414 1.709 1.709a.5.5 0 1 1-.707.707L7.614 8.323 6.2 9.737l.884.884a.5.5 0 1 1-.707.707l-.884-.884-1.415 1.415 1.71 1.709a.5.5 0 1 1-.708.707l-1.709-1.71zm-.706 1.415a1.5 1.5 0 0 1 0-2.122L12.917 1.606a1.5 1.5 0 0 1 2.122 0l3.535 3.535a1.5 1.5 0 0 1 0 2.121L7.26 18.576a1.5 1.5 0 0 1-2.12 0z"
						/></svg
					>
				</button>
				<button
					class="absolute left-2 btn btn-circle btn-sm bg-base-100 focus:bg-base-100 active:bg-base-100 border-opacity-50 text-base-content"
					style="bottom: {$elevationProfileVisible ? 'calc(25% + 8px)' : '8px'};"
					onclick={newMarker}
				>
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						><path
							d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
						/><line x1="12" y1="6" x2="12" y2="11" /><line
							x1="9.5"
							y1="8.5"
							x2="14.5"
							y2="8.5"
						/></svg
					>
				</button>
			{/if}
		</div>

		<div class="row-start-1 col-start-1 min-h-0 overflow-y-auto" bind:this={slotWrapper}>
			<slot />
		</div>
	</div>

	<!-- 64px navbar -->
	<div class="h-16">
		<div class="btm-nav" style="height: 60px">
			<a href="/app" class:active={$page.url.pathname === '/app'}>
				<button>Map</button>
			</a>
			<a
				href="/app/list"
				class:active={$page.url.pathname === '/app/list'}
				onclick={storeRenderedList}
			>
				<button>List</button>
			</a>
			<a href="/app/settings" class:active={$page.url.pathname === '/app/settings'}>
				<button>Settings</button>
			</a>
		</div>
	</div>
</div>

<style>
	.load-indicator {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: 9999;
		transition: opacity 300ms ease;
	}
	.load-bar-track {
		height: 4px;
		background: transparent;
		overflow: hidden;
	}
	.load-bar-fill {
		height: 100%;
		background: var(--bar-color);
		transition: width 200ms ease;
		position: relative;
	}
	.load-bar-indeterminate {
		width: 100% !important;
		transition: none;
	}
	.load-bar-fill::after {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: linear-gradient(
			90deg,
			transparent 0%,
			rgba(255, 255, 255, 0.3) 50%,
			transparent 100%
		);
		animation: load-shimmer 1.5s infinite;
	}
	.load-bar-text {
		font-size: 11px;
		padding: 2px 8px 4px;
		line-height: 1;
		letter-spacing: 0.01em;
	}
	.load-indicator-error .load-bar-fill {
		background: var(--bar-error) !important;
		animation: none;
	}
	.load-indicator-error .load-bar-fill::after {
		animation: none;
		background: none;
	}
	@keyframes load-shimmer {
		0% {
			transform: translateX(-100%);
		}
		100% {
			transform: translateX(100%);
		}
	}
	.elevation-profile-overlay {
		flex: 0 0 25%;
		background: white;
		border-top: 1px solid #ddd;
		z-index: 1;
		overflow: hidden;
	}
	.filter-funnel-btn {
		z-index: 2;
		border-radius: 6px;
	}
	.filter-funnel-open {
		border-radius: 6px 6px 0 0;
		border-bottom: none;
		margin-bottom: 1px;
	}
	.filter-funnel-active svg {
		stroke: #3b82f6;
	}
	.ruler-btn-active svg {
		stroke: #3b82f6;
		fill: #3b82f6;
	}
	.filter-bar-inner .btn:first-child {
		border-top-left-radius: 0;
		border-top-right-radius: 0;
	}
	.filter-bar-inner .btn:last-child {
		border-bottom-left-radius: 6px;
		border-bottom-right-radius: 6px;
	}
	.retry-btn {
		font-size: 11px;
		color: #d7230e;
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
		text-decoration: underline;
		font-weight: 500;
	}
	.map-attribution {
		position: absolute;
		bottom: 0;
		right: 0;
		font-size: 9px;
		opacity: 0.5;
		pointer-events: none;
		z-index: 1;
		padding: 2px 4px;
	}
	.map-attribution a {
		pointer-events: none;
		color: inherit;
		text-decoration: none;
	}
</style>
