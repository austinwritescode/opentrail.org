<script>
	import { onMount } from 'svelte';
	import maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	export const ssr = false;
	let key;
	let mod;
	let markers;
	let flags;
	let isModalOpen = false;
	let flagsScreen = false;
	let map;
	let loading = true;
	onMount(() => {
		const stored_key = localStorage.getItem('mod_key');
		if (stored_key) {
			key = stored_key;
			fetchModQueue();
		} else loading = false;
	});

	async function fetchModQueue() {
		const res = await fetch(`/api/mod?key=${key}`);
		if (res.status === 200) {
			const json = await res.json();
			console.log(json);
			mod = json.mod;
			markers = json.markers;
			flags = json.flags;
			localStorage.setItem('mod_key', key);
		}
		loading = false;
	}

	async function approve(id) {
		const item = mod.find((el) => el.id === id);
		const [path, query] = item.route.split('?');
		const params = new URLSearchParams(query);
		params.set('key', key);
		if (path === '/api/postImage') params.set('mod_id', id);
		const res = await fetch(`${path}?${params}`, {
			method: 'POST',
			body: JSON.stringify(item.request)
		});
		if (res.status === 200) reject(id); //(delete from queue)
	}

	async function reject(id) {
		const res = await fetch(`/api/mod?key=${key}`, {
			method: 'DELETE',
			body: id
		});
		if (res.status === 200) mod = mod.filter((v) => v.id !== id);
	}

	async function approveAll() {
		const ids = mod.map((item) => item.id);
		ids.forEach((id) => approve(id));
	}

	function viewLoc(id) {
		isModalOpen = true;
		const item = mod.find((val) => val.id === id);
		const oldMarker = markers[item.request.dbid];
		map = new maplibregl.Map({
			container: 'map',
			style: 'https://cdn.opentrail.org/style-outdoors.json',
			center: [item.request.lng, item.request.lat],
			zoom: 13
		});
		new maplibregl.Marker({ color: '#F00' }).setLngLat([oldMarker.lng, oldMarker.lat]).addTo(map);
		new maplibregl.Marker({ color: '#0F0' })
			.setLngLat([item.request.lng, item.request.lat])
			.addTo(map);
	}

	async function flagDeleteUnderlying(item) {
		const res = await fetch(`/api/deleteGeneric?type=${item.type}&id=${item.id}&key=${key}`, {
			method: 'DELETE'
		});
		if (res.status === 200) flags = flags.filter((v) => v != item);
	}

	async function flagIgnore(item) {
		const res = await fetch(
			`/api/deleteGeneric?ignore=true&type=${item.type}&id=${item.id}&key=${key}`,
			{
				method: 'DELETE'
			}
		);
		if (res.status === 200) flags = flags.filter((v) => v != item);
	}

	async function flagIgnoreAll() {
		flags.forEach((item) => flagIgnore(item));
	}

	async function clearTestTrail() {
		await fetch(`/api/deleteGeneric?type=clearTestTrail&key=${key}`, {
			method: 'DELETE'
		});
	}
</script>

<div class="tabs flex justify-center">
	<a
		class="tab tab-lg tab-bordered"
		class:tab-active={!flagsScreen}
		on:click={() => (flagsScreen = false)}
	>
		Mod Queue
	</a>
	<a
		class="tab tab-lg tab-bordered"
		class:tab-active={flagsScreen}
		on:click={() => (flagsScreen = true)}
	>
		Flags
	</a>
	<a class="tab tab-lg tab-bordered" on:click={clearTestTrail}> Clear Test Trail </a>
</div>
{#if flagsScreen}
	<div class="wrapper overflow-x-auto text-xs w-full">
		<table class="table table-compact table-zebra w-full">
			<thead>
				<tr>
					<th>
						<button class="btn bg-green-800" on:click={flagIgnoreAll}>Ign All</button>
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
							<button class="btn bg-green-800" on:click={() => flagIgnore(item)}>Ign</button>
							<button class="btn bg-red-800" on:click={() => flagDeleteUnderlying(item)}>Del</button
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
										<span class="text-xs">{new Date(item.comment.date).toLocaleDateString()}</span>
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
{:else if mod}
	<div class="wrapper overflow-x-auto text-xs">
		<table class="table table-compact table-zebra w-full">
			<thead>
				<tr>
					<th>
						<button class="btn bg-green-800" on:click={approveAll}>All</button>
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
							<button class="btn bg-green-800" on:click={() => approve(item.id)}>Y</button>
							<button class="btn bg-red-800" on:click={() => reject(item.id)}>N</button>
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
								<div class="flex flex-col" on:click={() => viewLoc(item.id)}>
									<span>
										OLD: {markers[item.request.dbid].lat}, {markers[item.request.dbid].lng}
									</span>
									<span>NEW: {item.request.lat}, {item.request.lng}</span>
								</div>{:else if item.route.includes('editIcons')}
								<div class="flex flex-col">
									<span>
										OLD:
										{#each markers[item.request.dbid].icons as icon}
											<img src={`/map-icons/${icon}.png`} height="25" width="25" class="inline" />
										{/each}
									</span>
									<span
										>NEW:
										{#each item.request.payload as icon}
											<img src={`/map-icons/${icon}.png`} height="25" width="25" class="inline" />
										{/each}</span
									>
								</div>
							{:else if item.route.includes('newMarker')}
								{JSON.stringify(item.request)}
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
			<button class="btn" on:click={fetchModQueue}>Submit</button>
		</div>
	</div>
{/if}

<div
	class={'modal modal-middle'}
	class:modal-open={isModalOpen}
	on:click|self={() => (isModalOpen = false)}
>
	<div class="modal-box h-5/6 w-5/6">
		<div id="map" class="h-full w-full" />
	</div>
</div>

<style>
	.wrapper {
		height: calc(100% - 48px);
	}
</style>
