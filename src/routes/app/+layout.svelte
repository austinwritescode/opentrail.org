<script>
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
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
		userMiles
	} from '$lib/store.js';
	import MarkerSlide from '$lib/MarkerSlide.svelte';
	import MarkerDetail from '$lib/MarkerDetail.svelte';
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

	onMount(async () => {
		if (!Object.keys(TRAILS).includes($settings.trail)) goto('/');
		if ($settings.autosync) await syncData();
		else if ($data.features.length === 0) await getData();
		await initializeMap();
	});

	let filteredIdx;
	$: updateFilteredIdx(activeIcons, $data);
	function updateFilteredIdx() {
		updateSelectedMarker(-1); //always deselect marker to prevent reindex issues
		filteredIdx = $data.features.reduce((acc, curr, idx) => {
			for (const char of curr.properties.icons) {
				if (activeIcons[ICONS.indexOf(char)]) {
					acc.push(idx);
					break;
				}
			}
			return acc;
		}, []);
		// console.log(filteredIdx);
	}

	const iconLayers = ICONS.map((icon) => {
		return `markers-${icon}`;
	});
	let activeIcons = new Array(ICONS.length).fill(true);
	let lastToggleAllIcons = true;
	function toggleIconLayer(i) {
		activeIcons[i] = !activeIcons[i];
		updateIconLayer(i);
	}
	function toggleAllIcons() {
		lastToggleAllIcons = !lastToggleAllIcons;
		activeIcons = activeIcons.fill(lastToggleAllIcons);
		for (let i = 0; i < ICONS.length; i++) updateIconLayer(i);
	}
	function updateIconLayer(i) {
		map.setLayoutProperty(iconLayers[i], 'visibility', activeIcons[i] ? 'visible' : 'none');
		map.setLayoutProperty(
			iconLayers[i] + '-selected',
			'visibility',
			activeIcons[i] ? 'visible' : 'none'
		);
	}

	let map;
	let mapInitialized = false;
	$: if (mapInitialized) map.getSource('markers')?.setData($data);
	let selectedMarkerId = -1;

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
				window.removeEventListener('deviceorientationabsolute', compassListener);
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
					DeviceOrientationEvent.requestPermission() //handle existing permission without modal
						.then((response) => {
							if (response === 'granted')
								window.addEventListener('deviceorientation', compassListener, true);
						})
						.catch((e) => {
							//otherwise we need a special modal with requestpermission in its onclick
							openModal({
								type: 'iOSCompass',
								submit: () => {
									$modal.isModalOpen = false;
									DeviceOrientationEvent.requestPermission().then((response) => {
										if (response === 'granted')
											window.addEventListener('deviceorientation', compassListener, true);
									});
								},
								cancel: () => {
									$modal.isModalOpen = false;
									compassDisabled = true;
								}
							});
						});
				} else {
					console.log('Starting Android compass marker');
					window.addEventListener('deviceorientationabsolute', compassListener);
				}
			}
		});
		map.addControl(geolocate);

		map.on('click', (e) => {
			if (
				map.queryRenderedFeatures(e.point).findIndex((el) => el.layer.source === 'markers') === -1
			) {
				updateSelectedMarker(-1);
			}
		});

		await Promise.all(
			ICONS.map(async (icon) => {
				await addImageToMap(icon);
				await addImageToMap(icon + '-selected');
			})
		);

		map.on('load', populateMap);
		slotWrapper.addEventListener('repopulateMap', repopulateMap);

		const canvases = document.getElementsByTagName('canvas');
		if (canvases.length > 1) errorModal('map error');
		canvases[0].addEventListener('webglcontextlost', (e) => {
			console.log('Reinitilizing map on webgl context lost');
			map.initialized = false;
			map.remove();
			console.log('Map cleared');
			initializeMap();
			console.log('Map reinitialized');
		});
		// this code helps reproduce the webgl lost context bug on long running instances:
		// setTimeout(() => {
		// 	const canvases = document.getElementsByTagName('canvas');
		// 	console.log(canvases[0].getContext('webgl'));
		// 	console.log(canvases.length);
		// 	canvases[0].getContext('webgl').getExtension('WEBGL_lose_context').loseContext();
		// 	// initializeMap();
		// }, 3000);
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
	}

	function repopulateMap() {
		activeIcons = new Array(ICONS.length).fill(true);
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
		// console.log('selected: ' + id);
		if (lockSelection) return;
		if (selectedMarkerId === id) return;
		if (selectedMarkerId !== -1)
			map.setFeatureState({ source: 'markers', id: selectedMarkerId }, { selected: false });
		if (id !== -1) map.setFeatureState({ source: 'markers', id: id }, { selected: true });
		else showSwiper = false;
		if (slide && swiperEl && id >= 0) swiperSlide(id, false);
		selectedMarkerId = id;
	}
	$: if (swiperEl) swiperSlide();
	function swiperSlide(id = selectedMarkerId, init = true) {
		const swiperParams = {
			virtual: {
				slides: filteredIdx,
				renderExternal: (d) => {
					const slides = swiperEl.getElementsByTagName('swiper-slide');
					for (let i = slides.length - 1; i >= 0; i--) slides.item(i).remove();
					for (let i = d.from; i <= d.to; i++) {
						new MarkerSlide({
							target: swiperEl,
							props: { index: filteredIdx[i], offset: d.offset }
						});
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
		const oldCoordCopy = [...$data.features[selectedMarkerId].geometry.coordinates];
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
				} else $data.features[selectedMarkerId].geometry.coordinates = oldCoordCopy;

				// map.getSource('markers').setData($data);
				lockSelection = false;
				updateSelectedMarker(-1);
			},
			submit: async () => {
				map.off('move', editMarkerLocOnMove);
				window.location.hash = '';
				lockSelection = false;

				const feature = $data.features[selectedMarkerId];
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
		$data.features[selectedMarkerId].geometry.coordinates[0] = latlng.lng;
		$data.features[selectedMarkerId].geometry.coordinates[1] = latlng.lat;
		$data.features[selectedMarkerId].properties.images = [];
		$data.features[selectedMarkerId].properties.comments = [];
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

	function storeRenderedProfile() {}

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
			class="row-start-1 col-start-1"
		>
			<div id="map" class="h-full w-full" />
			<!-- filter icons -->
			<div class="absolute top-32 right-2 btn-group btn-group-vertical">
				<button
					class="btn btn-circle btn-sm bg-white focus:bg-white active:bg-white border-opacity-50"
					on:click={toggleAllIcons}
				>
					<img src={'/map-icons/select-all.png'} height="20px" width="20px" />
				</button>
				{#each ICONS as icon, i}
					<button
						class="btn btn-circle btn-sm bg-white focus:bg-white active:bg-white border-opacity-50"
						class:opacity-40={!activeIcons[i]}
						on:click={() => toggleIconLayer(i)}
					>
						<img src={`/map-icons/${icon}.png`} />
					</button>
				{/each}
			</div>
			<!-- detail modal -->
			{#if $fragment.has('detail')}
				<MarkerDetail />
			{/if}
			<!-- swiper or new marker button -->
			{#if selectedMarkerId !== -1}
				<swiper-container
					class="absolute bottom-20 w-full h-40"
					style="visibility: {$fragment.toString().length < 2 && showSwiper
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
				href="/app/profile"
				class:active={$page.url.pathname === '/app/profile'}
				on:click={storeRenderedProfile}
			>
				<button>Profile</button>
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
	.new-marker-button {
		bottom: 72px;
	}
</style>
