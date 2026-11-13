<script>
	export let name = 'map';
	export let size = 22;
	const icons = import.meta.glob('./assets/icons/ui/*.svg', {
		query: '?raw',
		import: 'default',
		eager: true
	});
	const aliases = {
		pin: 'waypoints',
		plus: 'add',
		mountain: 'elevation',
		chevron: 'chevron-right',
		back: 'chevron-left'
	};
	$: source = icons['./assets/icons/ui/' + (aliases[name] || name) + '.svg'];
	// Only bundled design assets enter this markup; no user-provided HTML.
	$: svg = source
		? String(source)
				.replace('width="24"', 'width="' + size + '"')
				.replace('height="24"', 'height="' + size + '"')
				.replace('<svg ', '<svg aria-hidden="true" ')
		: '<svg aria-hidden="true" width="' +
			size +
			'" height="' +
			size +
			'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12l4 4L19 6"/></svg>';
</script>

{@html svg}
