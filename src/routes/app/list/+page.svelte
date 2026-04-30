<script>
	import { data, detailId, renderedMarkers, settings, trailRoute, selectedMarkerId } from '$lib/store.js';
	import MarkerDetail from '$lib/MarkerDetail.svelte';

	function listNavigate(id) {
		$selectedMarkerId = id;
		$detailId = id;
	}
	$: listPos = $renderedMarkers.indexOf($detailId);
	$: listOnPrev = listPos > 0 ? () => listNavigate($renderedMarkers[listPos - 1]) : undefined;
	$: listOnNext = listPos >= 0 && listPos < $renderedMarkers.length - 1 ? () => listNavigate($renderedMarkers[listPos + 1]) : undefined;
</script>

<table class="table table-zebra table-fixed w-full">
	<thead class="sticky top-0">
		<tr>
			<th class="w-10"></th>
			<th class="w-16">Mile</th>
			<th>Description</th>
		</tr>
	</thead>
	<tbody>
		{#each $renderedMarkers as i}
			<tr onclick={() => $detailId = i}>
				<td class="p-0 pl-2">
					<img
						src={`/map-icons/${$data.features[i].properties.icon}.png`}
						height="50"
						width="50"
						class="mx-auto"
					/>
				</td>
				<td
					>{$settings.reverseMiles
						? (
								$trailRoute.features[0].geometry.coordinates.length / 10 -
								$data.features[i].properties.mile
						  ).toFixed(1)
						: $data.features[i].properties.mile}</td
				>
				<td class="truncate">{$data.features[i].properties.title}</td>
			</tr>
		{/each}
	</tbody>
</table>
{#if $renderedMarkers.length === 0}
	<div class="text-xl flex items-center h-full justify-center">
		No markers visible in map window
	</div>
{/if}

{#if $detailId !== -1}
	<MarkerDetail onPrev={listOnPrev} onNext={listOnNext} />
{/if}
