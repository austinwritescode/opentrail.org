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
	import { goto, replaceState } from '$app/navigation';
	import { syncData, postGeneric, getData } from '$lib/api';
import { getOPFSFileSize } from '$lib/download.js';
	import { searchTrailRoute } from '$lib/helpers.js';
	import { decodeTrail } from '$lib/decode-trail.js';
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
			cursorMapMarker = new maplibregl.Marker({element: el}).setLngLat(lngLat).addTo(map);
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
		const params = $page.url.searchParams;
		const deepTrail = params.get('trail');
		const deepMarkerDbid = params.get('marker');
		if (deepTrail && TRAILS[deepTrail]) {
			$settings.trail = deepTrail;
		}
		if (!Object.keys(TRAILS).includes($settings.trail)) goto('/');
		if ($settings.autosync) await syncData();
		else if ($data.features.length === 0) await getData();
		await initializeMap();
	if ($settings.offline) {
		const size = await getOPFSFileSize($settings.trail);
		if (!size) $settings.offline = false;
	}
		if (deepMarkerDbid) {
			const idx = $data.features.findIndex(f => f.properties.dbid == deepMarkerDbid);
			if (idx !== -1) {
				updateSelectedMarker(idx, true);
				$detailId = idx;
			}
			replaceState('/app', {});
		}
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
	$: if (mapInitialized) map.getSource('markers')?.setData($data);

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
		if ($settings.offline && await getOPFSFileSize($settings.trail)) {
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

	const styleRes = await fetch('https://cdn.opentrail.org/style-outdoors.json');
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
	el.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="#1CA1F3" style="display:block;margin:0 auto"><path d="M12 2l8 16H4z"/></svg>';
	el.style.width = '46px';
	el.style.height = '46px';
	el.style.display = 'flex';
	el.style.alignItems = 'flex-start';
	el.style.justifyContent = 'center';
		const headingMarker = new maplibregl.Marker({element: el});
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
    geolocate.on('trackuserlocationstart', () => { clearTimeout(disableTimeout); });
    geolocate.on('trackuserlocationend', () => { disableTimeout = setTimeout(disableCompass, 300); });
    function attachCompassListener() {
        if (compassDisabled || !window.DeviceOrientationEvent) return;
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
    geolocate.on('geolocate', function (geo) {
			if (new Date() - $userMiles.date > 60000) {
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
			if (
				map.queryRenderedFeatures(e.point).findIndex((el) => el.layer.source === 'markers') === -1
			) {
				updateSelectedMarker(-1);
				removeCursorMarker();
			}
		});

	map.on('error', (e) => errorModal(e.error || new Error(`Map: ${JSON.stringify(e.error)}`)));
	await new Promise(resolve => map.once('load', resolve));
	await Promise.all(
		ICONS.map(async (icon) => {
			await addImageToMap(icon);
			await addImageToMap(icon + '-selected');
		})
	);
	await populateMap();

	const canvases = document.getElementsByTagName('canvas');
	if (canvases.length > 1) errorModal(new Error('Multiple map canvases detected'));
}

	function onMarkerClick(e) {
		updateSelectedMarker(e.features[0].id);
	}

	async function populateMap() {
		const res = await fetch(`https://cdn.opentrail.org/${$settings.trail}.json`);
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
			map.on('click', `markers-${icon}`, onMarkerClick);
		}
	mapInitialized = true;
	map.off('move', onMapMove);
		map.on('move', onMapMove);
		updateProfileData();
		map.once('idle', () => {
			storeRenderedList();
		});
	}

	async function changeTrailOnMap() {
		if (!map || !mapInitialized) return;
		mapInitialized = false;
		$activeIcons = new Array(ICONS.length).fill(true);
		lastToggleAllIcons = true;

	for (const icon of ICONS) {
		map.removeLayer(`markers-${icon}`);
		map.removeLayer(`markers-${icon}-selected`);
		map.off('click', `markers-${icon}`, onMarkerClick);
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
    errorModal(new Error('No offline data for this trail. Connect to the internet to load map tiles.'));
  }
	const styleRes = await fetch('https://cdn.opentrail.org/style-outdoors.json');
		const style = await styleRes.json();
		const compositeLayers = style.layers.filter((l) => l.source === 'composite');
		for (const layer of compositeLayers) {
			map.addLayer(layer);
		}
		compositeLayerIds = compositeLayers.map((l) => l.id);

	map.fitBounds(TRAILS[$settings.trail].bounds);
	await populateMap();
}

let currentTrail = $settings.trail;
$: if (mapInitialized) {
	$settings.offline;
	$settings.trail;
	if ($settings.trail !== currentTrail) {
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
									onNext: i === activeIdx && i < filteredIdx.length - 1 ? () => swiperEl.swiper.slideNext() : undefined
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
		const { data: image } = await map.loadImage(`/map-icons/${name}.png`);
		map.addImage(name, image);
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
		map.addSource('editMarker', { type: 'geojson', data: { type: 'FeatureCollection', features: [editFeature] } });
		const icons = feature.properties.icons || [feature.properties.icon];
		editLayerId = `markers-${icons[0]}-selected`;
		map.addLayer({
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
		}, editLayerId);
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
			features: [{
				type: 'Feature',
				geometry: { type: 'Point', coordinates: editCoords },
				properties: editFeatureProps,
				id: 'edit'
			}]
		});
	}

	function onSlideChange(e) {
		if (!mapInitialized) return;
		const id = filteredIdx[e.detail[0].activeIndex];
		updateSelectedMarker(id, false);
		const mapEl = map.getContainer();
		const swiperTop = swiperEl.getBoundingClientRect().top - mapEl.getBoundingClientRect().top;
		const isCurrentlyRendered = map.queryRenderedFeatures(
			[[0, 0], [mapEl.clientWidth, swiperTop]],
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
	<!-- main area full height minus navbar, use grid to overlap divs + css "visibility" to cache map for fast navigation -->
	<div style="height: calc(100dvh - 64px);" class="grid grid-cols-1 grid-rows-1">
		<!-- hide the map when visiting other routes -->
		<div
			style="visibility: {$page.url.pathname === '/app' ? 'visible' : 'hidden'};"
			class="row-start-1 col-start-1 relative flex flex-col"
		>
			<div id="map" class="flex-1 w-full min-h-0"></div>
			<!-- elevation profile overlay -->
			{#if $elevationProfileVisible}
				<div class="elevation-profile-overlay" style="background: {$settings.dark ? '#1e1e1e' : 'white'}; border-top: 1px solid {$settings.dark ? '#444' : '#ddd'};">
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
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#333333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h18l-7 8.5V18l-4 2v-7.5L3 4z"/></svg>
				</button>
				{#if filtersVisible}
					<div in:slide={{ duration: 200 }} out:slide={{ duration: 200 }}>
						<div class="btn-group btn-group-vertical filter-bar-inner">
							<button
								class="btn btn-circle btn-sm bg-white focus:bg-white active:bg-white border-opacity-50"
							onclick={toggleAllIcons}
							>
								<img src={'/map-icons/select-all.png'} height="20px" width="20px" />
							</button>
							{#each ICONS as icon, i}
								<button
									class="btn btn-circle btn-sm bg-white focus:bg-white active:bg-white border-opacity-50"
									class:opacity-40={!$activeIcons[i]}
									onclick={() => toggleIconLayer(i)}
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
				onclick={toggleProfile}
				title={$elevationProfileVisible ? 'Hide elevation profile' : 'Show elevation profile'}
			>
				{#if $elevationProfileVisible}
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#333333" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6" /></svg>
				{:else}
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#333333" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20L8 10L14 14L22 4" /></svg>
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
					style="bottom: {$elevationProfileVisible ? 'calc(25% + 8px)' : '8px'}; visibility: {$detailId === -1 && showSwiper
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
					class="absolute new-marker-button right-2 btn btn-circle btn-sm btn-primary"
					style="bottom: {$elevationProfileVisible ? 'calc(25% + 8px)' : '8px'};"
					onclick={newMarker}
				>
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
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
