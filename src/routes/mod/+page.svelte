<script>
 import { onMount } from 'svelte';
 import maplibregl from 'maplibre-gl';
 import 'maplibre-gl/dist/maplibre-gl.css';
 import { Protocol } from 'pmtiles';
 import { haversine } from '$lib/helpers.js';
 /** @type {import('pmtiles').Protocol | undefined} */
 let pmtilesProtocol;
 let key;
 let mod;
 let markers;
 let flags;
 let comments;
 /** @type {Record<string, GeoJSON.FeatureCollection>} */
 let trailData = {};
 /** @type {Record<number, { title: string, icon: string, icons: string, dist: number } | null>} */
 let nearest = {};
 let isModalOpen = false;
 let tab = 'queue';
 let map;
 let loading = true;
	function authHeaders(extra = {}) {
		return { ...extra, headers: { Authorization: `Bearer ${key}` } };
	}
	onMount(() => {
		const stored_key = localStorage.getItem('mod_key');
		if (stored_key) {
			key = stored_key;
			fetchModQueue();
		} else loading = false;
	});

 async function fetchModQueue() {
 const res = await fetch('/api/mod', authHeaders());
 if (res.status === 200) {
 const json = await res.json();
 console.log(json);
 mod = json.mod;
 markers = json.markers;
 flags = json.flags;
 localStorage.setItem('mod_key', key);
 await fetchNearestMarkers();
 }
 loading = false;
 }

 async function fetchNearestMarkers() {
 const newMarkerTrails = new Set();
 for (const item of mod) {
 if (item.route.includes('newMarker') && item.request.trail) {
 newMarkerTrails.add(item.request.trail);
 }
 }
 for (const trail of newMarkerTrails) {
 if (trail in trailData) continue;
 const r = await fetch(`/api/getData?trail=${trail}`);
 if (r.status === 200) trailData[trail] = await r.json();
 }
 nearest = {};
 for (const item of mod) {
 if (!item.route.includes('newMarker')) continue;
 const trail = item.request.trail;
 const fc = trailData[trail];
 if (!fc || !fc.features) continue;
 let best = null;
 let bestDist = Infinity;
 for (const feature of fc.features) {
 const [flng, flat] = feature.geometry.coordinates;
 const dist = haversine(item.request.lat, item.request.lng, flat, flng);
 if (dist < bestDist) {
 bestDist = dist;
 best = {
 title: feature.properties.title,
 icon: feature.properties.icon,
 icons: feature.properties.icons,
 dist
 };
 }
 }
 nearest[item.id] = best;
 }
 }

	async function approve(id) {
		const item = mod.find((el) => el.id === id);
		const [path, query] = item.route.split('?');
		const params = new URLSearchParams(query);
		if (path === '/api/postImage') params.set('mod_id', id);
		const res = await fetch(`${path}?${params}`, authHeaders({
			method: 'POST',
			body: JSON.stringify(item.request)
		}));
		if (res.status === 200) reject(id); //(delete from queue)
	}

	async function reject(id) {
		const res = await fetch('/api/mod', authHeaders({
			method: 'DELETE',
			body: id
		}));
		if (res.status === 200) mod = mod.filter((v) => v.id !== id);
	}

	async function approveAll() {
		for (const item of [...mod]) {
			await approve(item.id);
		}
	}

	function viewLoc(id) {
		isModalOpen = true;
		const item = mod.find((val) => val.id === id);
		const oldMarker = markers[item.request.dbid];
		const trail = item.request.trail || 'PCT';
		if (!pmtilesProtocol) {
			pmtilesProtocol = new Protocol();
			maplibregl.addProtocol('pmtiles', pmtilesProtocol.tile);
		}
		fetch('https://cdn.opentrail.org/style-outdoors.json')
			.then((r) => r.json())
			.then((style) => {
				style.sources.composite = {
					type: 'vector',
					url: `pmtiles://https://cdn.opentrail.org/${trail}.pmtiles`
				};
				map = new maplibregl.Map({
					container: 'map',
					style: style,
					center: [item.request.lng, item.request.lat],
					zoom: 13
				});
				new maplibregl.Marker({ color: '#F00' }).setLngLat([oldMarker.lng, oldMarker.lat]).addTo(map);
				new maplibregl.Marker({ color: '#0F0' })
					.setLngLat([item.request.lng, item.request.lat])
					.addTo(map);
			});
	}

	async function flagDeleteUnderlying(item) {
		const res = await fetch(`/api/deleteGeneric?type=${item.type}&id=${item.id}`, authHeaders({
			method: 'DELETE'
		}));
		if (res.status === 200) flags = flags.filter((v) => v != item);
	}

	async function flagIgnore(item) {
		const res = await fetch(
			`/api/deleteGeneric?ignore=true&type=${item.type}&id=${item.id}`,
			authHeaders({ method: 'DELETE' })
		);
		if (res.status === 200) flags = flags.filter((v) => v != item);
	}

	async function flagIgnoreAll() {
		for (const item of [...flags]) {
			await flagIgnore(item);
		}
	}

	async function clearTestTrail() {
		await fetch('/api/deleteGeneric?type=clearTestTrail', authHeaders({
			method: 'DELETE'
		}));
	}

	async function fetchComments() {
		const res = await fetch('/api/mod/comments', authHeaders());
		if (res.status === 200) comments = await res.json();
	}

	async function deleteComment(id) {
		const res = await fetch(`/api/mod/comments?id=${id}`, authHeaders({ method: 'DELETE' }));
		if (res.status === 200) comments = comments.filter((c) => c.id !== id);
	}
</script>

<div class="tabs flex justify-center">
	<a
		class="tab tab-lg tab-bordered"
		class:tab-active={tab === 'queue'}
		onclick={() => (tab = 'queue')}
	>
		Mod Queue
	</a>
	<a
		class="tab tab-lg tab-bordered"
		class:tab-active={tab === 'flags'}
		onclick={() => (tab = 'flags')}
	>
		Flags
	</a>
	<a
		class="tab tab-lg tab-bordered"
		class:tab-active={tab === 'comments'}
		onclick={() => { tab = 'comments'; if (!comments) fetchComments(); }}
	>
		Comments
	</a>
	<a class="tab tab-lg tab-bordered" onclick={clearTestTrail}> Clear Test Trail </a>
</div>
{#if tab === 'comments'}
	<div class="wrapper overflow-x-auto text-xs w-full">
		<div class="p-2">
			<button class="btn btn-sm" onclick={fetchComments}>Refresh</button>
		</div>
		<table class="table table-compact table-zebra w-full">
			<thead>
				<tr>
					<th></th>
					<th>Date</th>
					<th>User</th>
					<th>Trail</th>
					<th>Marker</th>
					<th>Comment</th>
				</tr>
			</thead>
			<tbody>
				{#if comments}
					{#each comments as comment}
						<tr>
							<td>
								<button class="btn bg-red-800 btn-sm" onclick={() => deleteComment(comment.id)}>Del</button>
							</td>
							<td>{new Date(comment.date).toISOString().slice(0, 10)}</td>
							<td>{comment.user}</td>
							<td>{comment.marker.trails[0]?.trail.name ?? ''}</td>
							<td>{comment.marker.title}</td>
							<td>
								<div class="chat chat-start">
									<div class="chat-bubble whitespace-pre-wrap break-words w-full max-w-full text-sm">
										{comment.text}
									</div>
								</div>
							</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>
{:else if tab === 'flags'}
	<div class="wrapper overflow-x-auto text-xs w-full">
		<table class="table table-compact table-zebra w-full">
			<thead>
				<tr>
					<th>
						<button class="btn bg-green-800" onclick={flagIgnoreAll}>Ign All</button>
					</th>
					<th>Date</th>
					<th>reporting IP</th>
					<th>reporting user</th>
					<th>Marker/Comment/Image</th>
					<th>Reason</th>
				</tr>
			</thead>
			<tbody>
				{#each flags as item}
					<tr>
						<th>
							<button class="btn bg-green-800" onclick={() => flagIgnore(item)}>Ign</button>
							<button class="btn bg-red-800" onclick={() => flagDeleteUnderlying(item)}>Del</button
							>
						</th>
						<td>{new Date(item.date).toLocaleString('en-US')}</td>
						<td>{item.ip}</td>
						<td>{item.user}</td>
						<td>
							{#if item.type === 'image'}
								<img src={`https://cdn.opentrail.org/img/${item.image}.jpg`} />
							{:else if item.type === 'comment'}
								<div class="chat chat-start">
									<div class="chat-header">
										<span class="text-xs">{new Date(item.comment.date).toISOString().slice(0, 10)}</span>
										<span class="opacity-60">{item.comment.user}</span>
									</div>
									<div
										class="chat-bubble whitespace-pre-wrap break-words w-full max-w-full text-sm"
									>
										{item.comment.text}
									</div>
								</div>
							{:else}
								{JSON.stringify(item.marker)}
							{/if}
						</td>
						<td>{item.reason}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{:else if tab === 'queue' && mod}
	<div class="wrapper overflow-x-auto text-xs">
		<table class="table table-compact table-zebra w-full">
			<thead>
				<tr>
					<th>
						<button class="btn bg-green-800" onclick={approveAll}>All</button>
					</th>
					<th>Date</th>
					<th>IP</th>
					<th>User</th>
					<th>Type</th>
					<th>Trail</th>
					<th>Request</th>
					<th>Current</th>
				</tr>
			</thead>
			<tbody>
				{#each mod as item}
					<tr>
						<th>
							<button class="btn bg-green-800" onclick={() => approve(item.id)}>Y</button>
							<button class="btn bg-red-800" onclick={() => reject(item.id)}>N</button>
						</th>
						<td>{new Date(item.date).toLocaleString('en-US')}</td>
						<td>{item.ip}</td>
						<td>{item.request.user}</td>
						<td>{item.route.includes('type') ? item.route.split('=').pop() : item.route}</td>
						<td
							>{item.request.trail ||
								(item.request.dbid && markers[item.request.dbid].trails[0].trail.name)}</td
						>
						<td>
							{#if item.image}<img src={'data:image/jpeg;base64, ' + item.image} />
							{:else if item.route.includes('editTitle')}
								<div class="flex flex-col">
									<span>OLD: {markers[item.request.dbid].title}</span>
									<span>NEW: {item.request.payload}</span>
								</div>
							{:else if item.route.includes('editDesc')}
								<div class="flex flex-col">
									<span>OLD: {markers[item.request.dbid].desc}</span>
									<span>NEW: {item.request.payload}</span>
								</div>
							{:else if item.route.includes('editLoc')}
								<div class="flex flex-col" onclick={() => viewLoc(item.id)}>
									<span>
										OLD: {markers[item.request.dbid].lat}, {markers[item.request.dbid].lng}
									</span>
									<span>NEW: {item.request.lat}, {item.request.lng}</span>
								</div>{:else if item.route.includes('editIcons')}
								<div class="flex flex-col">
									<span>
										OLD:
										{#each markers[item.request.dbid].icons as icon}
											<img src={`https://cdn.opentrail.org/icons/${icon}.png`} height="25" width="25" class="inline" />
										{/each}
									</span>
									<span
										>NEW:
										{#each item.request.payload as icon}
											<img src={`https://cdn.opentrail.org/icons/${icon}.png`} height="25" width="25" class="inline" />
										{/each}</span
									>
								</div>
{:else if item.route.includes('newMarker')}
 <div class="flex flex-col">
 <span>{item.request.title}</span>
<span>{item.request.desc}</span>
<span>{item.request.lat}, {item.request.lng}</span>
 {#if nearest[item.id]}
 <span class="text-yellow-500">
 Nearest:
 <img src={`https://cdn.opentrail.org/icons/${nearest[item.id].icon}.png`} height="16" width="16" class="inline" />
 {nearest[item.id].title}
 ({nearest[item.id].dist.toFixed(2)} mi)
 </span>
 {/if}
 </div>
							{/if}
						</td>
						<td>{JSON.stringify(markers[item.request.dbid])}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{:else if loading}
	<div class="flex justify-center items-center h-full text-3xl">Loading</div>
{:else}
	<div class="flex flex-col justify-center items-center h-full">
		<div class="form-control">
			<label class="input-group input-group-lg">
				<span>Mod key:</span>
				<input type="password" class="input input-bordered input-lg" bind:value={key} />
			</label>
			<button class="btn" onclick={fetchModQueue}>Submit</button>
		</div>
	</div>
{/if}

<div
	class={'modal modal-middle'}
	class:modal-open={isModalOpen}
	onclick={(e) => e.target === e.currentTarget && (isModalOpen = false)}
>
	<div class="modal-box h-5/6 w-5/6">
		<div id="map" class="h-full w-full"></div>
	</div>
</div>

<style>
	.wrapper {
		height: calc(100% - 48px);
	}
</style>
