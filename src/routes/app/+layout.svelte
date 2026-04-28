<script>
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import {
		settings,
		data,
		TRAILS,
		ICONS,
		renderedMarkers,
		fragment,
		openModal,
		modal,
		errorModal,
		trailRoute,
		userMiles,
		elevationProfileVisible,
		profileData,
		selectedMarkerId,
		activeIcons
	} from '$lib/store.js';
	import MarkerSlide from '$lib/MarkerSlide.svelte';
	import MarkerDetail from '$lib/MarkerDetail.svelte';
	import ElevationProfile from '$lib/ElevationProfile.svelte';
	import { goto } from '$app/navigation';
	import { syncData, postGeneric, getData } from '$lib/api';
	import { searchTrailRoute } from '$lib/helpers.js';
	import { register } from 'swiper/element/bundle';
	register();
	import SwiperCore, { Virtual } from 'swiper';
	SwiperCore.use([Virtual]);
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
		if (points.length === 0 || points[points.length - 1].mile !== (endIdx / 10)) {
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

	function onCursorUpdate(e) {
		const { active, trailIdx } = e.detail;
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
			cursorMapMarker = new maplibregl.Marker(el).setLngLat(lngLat).addTo(map);
		}
	}

	function removeCursorMarker() {
		if (cursorMapMarker) {
			cursorMapMarker.remove();
			cursorMapMarker = null;
		}
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

	onMount(async () => {
		if (!Object.keys(TRAILS).includes($settings.trail)) goto('/');
		if ($settings.autosync) await syncData();
		else if ($data.features.length === 0) await getData();
		await initializeMap();
	});

	let filteredIdx;
	$: updateFilteredIdx($activeIcons, $data);
	function updateFilteredIdx() {
		updateSelectedMarker(-1);
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

	const iconLayers = ICONS.map((icon) => {
		return `markers-${icon}`;
	});
	let filtersVisible = false;
	let lastToggleAllIcons = true;
	function toggleIconLayer(i) {
		$activeIcons[i] = !$activeIcons[i];
		$activeIcons = $activeIcons;
		updateIconLayer(i);
	}
	function toggleAllIcons() {
		lastToggleAllIcons = !lastToggleAllIcons;
		$activeIcons = $activeIcons.fill(lastToggleAllIcons);
		for (let i = 0; i < ICONS.length; i++) updateIconLayer(i);
	}
	function toggleFilters() {
		filtersVisible = !filtersVisible;
		if (!filtersVisible) {
			$activeIcons = new Array(ICONS.length).fill(true);
			lastToggleAllIcons = true;
			for (let i = 0; i < ICONS.length; i++) updateIconLayer(i);
		}
	}
	function updateIconLayer(i) {
		map.setLayoutProperty(iconLayers[i], 'visibility', $activeIcons[i] ? 'visible' : 'none');
		map.setLayoutProperty(
			iconLayers[i] + '-selected',
			'visibility',
			$activeIcons[i] ? 'visible' : 'none'
		);
	}

	let map;
	let mapInitialized = false;
	let contextRestoreTimeout;
	$: if (mapInitialized) map.getSource('markers')?.setData($data);

	async function initializeMap() {
		if (!document.getElementById('map') || !slotWrapper) return setTimeout(initializeMap, 10); //for welcome screen load, wait for DOM to catch up

		map = new maplibregl.Map({
			container: 'map',
			style: 'https://cdn.opentrail.org/style-outdoors.json',
			bounds: TRAILS[$settings.trail].bounds,
			minZoom: 2
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
		el.style.backgroundImage = 'url(/heading_indicator.png)';
		el.style.backgroundPosition = 'top';
		el.style.backgroundSize = '16px';
		el.style.backgroundRepeat = 'no-repeat';
		el.style.width = '46px';
		el.style.height = '46px';
		const headingMarker = new maplibregl.Marker(el);
		let compassEnabled = false;
		let compassDisabled = false; //if user cancels compass prompt don't reprompt
		let lastHeading;
		let orientationEvent;
		const compassListener = (e) => {
			if (!compassEnabled) {
				headingMarker.addTo(map);
				compassEnabled = true;
			}
			let heading = e.webkitCompassHeading || 360 - e.alpha; // iOS || Android
			heading = Math.round(heading / 3) * 3; //nearest 3deg
			if (lastHeading === heading) return; //save the renderer some work
			else lastHeading = heading;
			headingMarker.setRotation(heading);
			if (geolocate._watchState === 'OFF') {
				compassEnabled = false;
				headingMarker.remove();
				window.removeEventListener(orientationEvent, compassListener, true);
			}
		};
		geolocate.on('geolocate', function (geo) {
			if (new Date() - $userMiles.date > 60000) {
				//limit the mile search algo to once per minute
				$userMiles.date = new Date();
				const min = searchTrailRoute(geo.coords.longitude, geo.coords.latitude, $trailRoute, 1);
				$userMiles.miles = min.index / 10;
				console.log($userMiles.miles);
			}
			headingMarker.setLngLat([geo.coords.longitude, geo.coords.latitude]);
			if (!compassEnabled && !compassDisabled && window.DeviceOrientationEvent) {
				const isIOS =
					navigator.userAgent.match(/(iPod|iPhone|iPad)/) &&
					navigator.userAgent.match(/AppleWebKit/);
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
		});
		map.addControl(geolocate);

		map.on('click', (e) => {
			if (
				map.queryRenderedFeatures(e.point).findIndex((el) => el.layer.source === 'markers') === -1
			) {
				updateSelectedMarker(-1);
				removeCursorMarker();
			}
		});

		await Promise.all(
			ICONS.map(async (icon) => {
				await addImageToMap(icon);
				await addImageToMap(icon + '-selected');
			})
		);

		map.on('load', populateMap);
		slotWrapper.removeEventListener('repopulateMap', repopulateMap);
		slotWrapper.addEventListener('repopulateMap', repopulateMap);

		const canvases = document.getElementsByTagName('canvas');
		if (canvases.length > 1) errorModal('map error');
		canvases[0].addEventListener('webglcontextlost', (e) => {
			e.preventDefault();
			console.log('WebGL context lost, waiting for restoration...');
			mapInitialized = false;
			contextRestoreTimeout = setTimeout(() => {
				errorModal('Map failed to recover. Please refresh the page.');
			}, 10000);
		});
		canvases[0].addEventListener('webglcontextrestored', () => {
			clearTimeout(contextRestoreTimeout);
			console.log('WebGL context restored, reinitializing map...');
			map.remove();
			map = null;
			initializeMap();
		});
	}

	async function populateMap() {
		const res = await fetch(`https://cdn.opentrail.org/${$settings.trail}.json`);
		$trailRoute = await res.json();
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
			data: $data
		});
		const markerLayout = {
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
		for (const icon of ICONS) {
			map.addLayer({
				id: `markers-${icon}`,
				type: 'symbol',
				source: 'markers',
				layout: {
					'icon-image': ['get', 'icon'],
					...markerLayout
				},
				paint: {
					'icon-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0, 1]
				},
				filter: ['in', icon, ['get', 'icons']]
			});
		}
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
			map.on('click', `markers-${icon}`, (e) => updateSelectedMarker(e.features[0].id));
		}
		mapInitialized = true;
		map.off('move', onMapMove);
		map.on('move', onMapMove);
		updateProfileData();
	}

	function repopulateMap() {
		$activeIcons = new Array(ICONS.length).fill(true);
		lastToggleAllIcons = true;
		for (const icon of ICONS) {
			map.removeLayer(`markers-${icon}`);
			map.removeLayer(`markers-${icon}-selected`);
		}
		map.removeSource('markers');
		map.removeLayer('route');
		map.removeSource('route');
		populateMap();
		map.fitBounds(TRAILS[$settings.trail].bounds);
	}

	function updateSelectedMarker(id, slide = true) {
		if (lockSelection) return;
		if ($selectedMarkerId === id) return;
		if ($selectedMarkerId !== -1)
			map.setFeatureState({ source: 'markers', id: $selectedMarkerId }, { selected: false });
		if (id !== -1) map.setFeatureState({ source: 'markers', id: id }, { selected: true });
		else {
			for (const comp of slideComponents) comp.$destroy();
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
					for (const comp of slideComponents) comp.$destroy();
					slideComponents = [];
					for (let i = d.from; i <= d.to; i++) {
						slideComponents.push(
							new MarkerSlide({
								target: swiperEl,
								props: { index: filteredIdx[i], offset: d.offset }
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

	function addImageToMap(name) {
		return new Promise((resolve, reject) => {
			map.loadImage(`/map-icons/${name}.png`, (error, image) => {
				if (error) throw error;
				map.addImage(name, image);
				resolve();
			});
		});
	}

	function newMarker() {
		let prop = { images: [] };
		openModal({
			type: 'text',
			data: ['Marker title', ''],
			submit: (title) => {
				prop.title = title[1];
				openModal({
					type: 'textArea',
					data: ['Marker description', ''],
					submit: (desc) => {
						prop.desc = desc[1];
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
								location.hash = `editLoc=${feature.id}&newMarker=1`;
							}
						});
					}
				});
			}
		});
	}
	let lockSelection = false;
	$: if ($fragment.get('editLoc')) {
		updateSelectedMarker(parseInt($fragment.get('editLoc')));
		lockSelection = true;
		editMarkerLoc($fragment.get('newMarker'));
	}
	function editMarkerLoc(newMarker) {
		const oldCoordCopy = [...$data.features[$selectedMarkerId].geometry.coordinates];
		if (newMarker) editMarkerLocOnMove(); //(initialize the new marker before map movement)
		openModal({
			type: 'editLoc',
			cancel: () => {
				map.off('move', editMarkerLocOnMove);
				window.location.hash = '';

				if (newMarker) {
					updateSelectedMarker(-1);
					$data.features.pop();
					// map.getSource('markers').setData($data);
					console.log($data);
				} else $data.features[$selectedMarkerId].geometry.coordinates = oldCoordCopy;

				// map.getSource('markers').setData($data);
				lockSelection = false;
				updateSelectedMarker(-1);
			},
			submit: async () => {
				map.off('move', editMarkerLocOnMove);
				window.location.hash = '';
				lockSelection = false;

				const feature = $data.features[$selectedMarkerId];
				if (newMarker) {
					updateSelectedMarker(-1);
					$data.features.pop(); //leaving the marker around only causes heartache since it has no dbid
					$data = $data; //trigger things
					// map.getSource('markers').setData($data);
					await postGeneric({
						route: 'postMarker?type=newMarker',
						data: {
							lat: feature.geometry.coordinates[1],
							lng: feature.geometry.coordinates[0],
							title: feature.properties.title,
							desc: feature.properties.desc,
							icons: feature.properties.icons,
							trail: $settings.trail
						}
					});
				} else {
					await postGeneric({
						route: 'postMarker?type=editLoc',
						data: {
							dbid: feature.properties.dbid,
							lat: feature.geometry.coordinates[1],
							lng: feature.geometry.coordinates[0],
							trail: $settings.trail
						}
					});
				}
			}
		});
		map.on('move', editMarkerLocOnMove);
	}
	function editMarkerLocOnMove() {
		const latlng = map.getCenter();
		$data.features[$selectedMarkerId].geometry.coordinates[0] = latlng.lng;
		$data.features[$selectedMarkerId].geometry.coordinates[1] = latlng.lat;
		$data.features[$selectedMarkerId].properties.images = [];
		$data.features[$selectedMarkerId].properties.comments = [];
		map.getSource('markers').setData($data);
	}

	function onSlideChange(e) {
		const id = filteredIdx[e.detail[0].activeIndex];
		updateSelectedMarker(id, false);
		const isCurrentlyRendered = map.queryRenderedFeatures({
			layers: iconLayers,
			filter: ['==', ['id'], id]
		});
		if (isCurrentlyRendered.length === 0)
			map.flyTo({
				center: $data.features[id].geometry.coordinates,
				duration: 500
			});
	}

	function storeRenderedList() {
		$renderedMarkers = map.queryRenderedFeatures({ layers: iconLayers }).map((val) => val.id);
		$renderedMarkers = [...new Set($renderedMarkers)]; //remove duplicates
		$renderedMarkers.sort((a, b) => a - b); //js is special
	}
</script>

<div class="flex flex-col h-full">
	<!-- main area full height minus navbar, use grid to overlap divs + css "visibility" to cache map for fast navigation -->
	<div style="height: calc(100% - 64px);" class="grid grid-cols-1">
		<!-- hide the map when visiting other routes -->
		<div
			style="visibility: {$page.url.pathname === '/app' ? 'visible' : 'hidden'};"
			class="row-start-1 col-start-1 relative flex flex-col"
		>
			<div id="map" class="flex-1 w-full min-h-0" />
			<!-- elevation profile overlay -->
			{#if $elevationProfileVisible}
				<div class="elevation-profile-overlay" style="background: {$settings.dark ? '#1e1e1e' : 'white'}; border-top: 1px solid {$settings.dark ? '#444' : '#ddd'};">
					<ElevationProfile on:cursorupdate={onCursorUpdate} />
				</div>
			{/if}
			<!-- filter funnel + collapsible filter icons -->
			<div class="absolute top-32 right-2 flex flex-col items-stretch">
				<button
					class="btn btn-circle btn-sm bg-white focus:bg-white active:bg-white border-opacity-50 filter-funnel-btn"
					class:filter-funnel-open={filtersVisible}
					class:filter-funnel-active={filtersVisible}
					on:click={toggleFilters}
				>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#333333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h18l-7 8.5V18l-4 2v-7.5L3 4z"/></svg>
				</button>
				{#if filtersVisible}
					<div in:slide={{ duration: 200 }} out:slide={{ duration: 200 }}>
						<div class="btn-group btn-group-vertical filter-bar-inner">
							<button
								class="btn btn-circle btn-sm bg-white focus:bg-white active:bg-white border-opacity-50"
								on:click={toggleAllIcons}
							>
								<img src={'/map-icons/select-all.png'} height="20px" width="20px" />
							</button>
							{#each ICONS as icon, i}
								<button
									class="btn btn-circle btn-sm bg-white focus:bg-white active:bg-white border-opacity-50"
									class:opacity-40={!$activeIcons[i]}
									on:click={() => toggleIconLayer(i)}
								>
									<img src={`/map-icons/${icon}.png`} />
								</button>
							{/each}
						</div>
					</div>
				{/if}
			</div>
			<!-- profile toggle button -->
			<button
				class="profile-toggle-btn"
				style="bottom: {$elevationProfileVisible ? 'calc(25% - 14px)' : '8px'}; background: {$settings.dark ? '#2a2a2a' : 'white'}; border-color: {$settings.dark ? '#555' : 'rgba(0,0,0,0.2)'}; color: {$settings.dark ? '#999' : '#666'};"
				on:click={toggleProfile}
				title={$elevationProfileVisible ? 'Hide elevation profile' : 'Show elevation profile'}
			>
				{#if $elevationProfileVisible}
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6" /></svg>
				{:else}
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20L8 10L14 14L22 4" /></svg>
				{/if}
			</button>
			<!-- detail modal -->
			{#if $fragment.has('detail')}
				<MarkerDetail />
			{/if}
			<!-- swiper or new marker button -->
			{#if $selectedMarkerId !== -1}
				<swiper-container
					class="absolute w-full h-40"
					style="bottom: {$elevationProfileVisible ? 'calc(25% + 8px)' : '8px'}; visibility: {$fragment.toString().length < 2 && showSwiper
						? 'inherit'
						: 'hidden'};"
					slides-per-view={1.15}
					space-between={15}
					centered-slides={true}
					speed={150}
					on:slidechange={onSlideChange}
					bind:this={swiperEl}
					init={false}
				/>
			{:else}
				<button
					class="absolute new-marker-button right-2 btn btn-circle btn-sm btn-primary"
					style="bottom: {$elevationProfileVisible ? 'calc(25% + 8px)' : '8px'};"
					on:click={newMarker}
				>
					<img src="/plus.png" height="20" width="20" />
				</button>
			{/if}
		</div>

		<div class="row-start-1 col-start-1" bind:this={slotWrapper}>
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
				on:click={storeRenderedList}
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
	.elevation-profile-overlay {
		flex: 0 0 25%;
		background: white;
		border-top: 1px solid #ddd;
		z-index: 1;
		overflow: hidden;
	}
	.profile-toggle-btn {
		position: absolute;
		left: 50%;
		transform: translateX(-50%);
		z-index: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: white;
		border: 1px solid rgba(0, 0, 0, 0.2);
		color: #666;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
		cursor: pointer;
		padding: 0;
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
	.filter-bar-inner .btn:first-child {
		border-top-left-radius: 0;
		border-top-right-radius: 0;
	}
	.filter-bar-inner .btn:last-child {
		border-bottom-left-radius: 6px;
		border-bottom-right-radius: 6px;
	}
</style>
