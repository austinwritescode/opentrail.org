<script>
	import { data, settings, trailRoute, userMiles } from '$lib/store.js';
	export let index;
	export let offset;

	const prop = $data.features[index].properties;
	// console.log(`rendering slide ${index}`)
</script>

<swiper-slide virtualIndex={index} style={`left: ${offset}px`}>
	<a href={`/app#detail=${$data.features[index].id}`}>
		<div class="bg-base-100 rounded-lg pt-2 p-4 w-full h-full">
			{#if prop.images.length > 0}
				<div class="indicator float-right rounded-lg m-1">
					{#if prop.images.length > 1}
						<span class="indicator-item badge badge-neutral p-1.5">
							{prop.images.length}
						</span>
					{/if}
					<img
						src={`https://cdn.opentrail.org/img/${prop.images[0]}.jpg`}
						height="80"
						width="80"
						class="rounded-lg"
						loading="lazy"
					/>
				</div>
			{/if}
			<p class="text-sm font-bold truncate">{prop.title}</p>
			<p class="text-sm italic">
				Mile {$settings.reverseMiles
					? ($trailRoute.features[0].geometry.coordinates.length / 10 - prop.mile).toFixed(1)
					: prop.mile}&nbsp;&nbsp;&nbsp;Elev {prop.elev?.toLocaleString('en-US')}
			</p>
			<p class="leading-none">
				{#if prop.icons}
					{#each prop.icons as icon}
						<img src={`/map-icons/${icon}.png`} height="20" width="20" class="inline" />
					{/each}
				{/if}
				{#if new Date() - $userMiles.date < 1000000}
					<span class="text-sm italic align-middle whitespace-nowrap">
						{Math.round(Math.abs($userMiles.miles - prop.mile) * 10) / 10} trail mi away
					</span>
				{/if}
			</p>
			<p class="text-sm whitespace-pre-wrap break-words">{prop.desc}</p>
		</div>
	</a>
</swiper-slide>