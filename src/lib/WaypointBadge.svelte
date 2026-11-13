<script>
	import { waypointKinds, waypointBadgeSVG } from './waypoint-icons.js';
	export let kind = 'o';
	export let size = 40;
	$: badge = waypointKinds[kind] || waypointKinds.o;
	$: svg = waypointBadgeSVG(kind).replace(
		'width="48" height="48"',
		'aria-hidden="true" width="' + size + '" height="' + size + '"'
	);
</script>

<span
	class="waypoint-badge"
	role="img"
	aria-label={badge.label}
	style:width="{size}px"
	style:height="{size}px"
>
	{@html svg}
</span>
