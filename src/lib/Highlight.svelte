<script>
	export let text = '';
	export let query = '';
	$: needle = query.trim().toLowerCase();
	$: parts = (() => {
		const value = String(text || '');
		if (!needle) return [{ text: value, match: false }];
		const result = [];
		let start = 0;
		let index;
		while ((index = value.toLowerCase().indexOf(needle, start)) !== -1) {
			result.push(
				{ text: value.slice(start, index), match: false },
				{ text: value.slice(index, index + needle.length), match: true }
			);
			start = index + needle.length;
		}
		result.push({ text: value.slice(start), match: false });
		return result;
	})();
</script>

{#each parts as part}{#if part.match}<mark>{part.text}</mark>{:else}{part.text}{/if}{/each}
