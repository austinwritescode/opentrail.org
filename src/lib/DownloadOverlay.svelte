<script>
	import { downloadState } from '$lib/store.js';
	import { slide } from 'svelte/transition';
	import prettyBytes from 'pretty-bytes';

	$: pct = $downloadState.total > 0 ? Math.round(($downloadState.downloaded / $downloadState.total) * 100) : 0;
	$: isBytes = $downloadState.total > 100000;
	$: downloadedLabel = isBytes ? prettyBytes($downloadState.downloaded) : $downloadState.downloaded;
	$: totalLabel = isBytes ? prettyBytes($downloadState.total) : $downloadState.total;

	function cancel() {
		$downloadState.onCancel();
	}
</script>

{#if $downloadState.active}
	<div class="download-overlay" in:slide={{ duration: 200 }} out:slide={{ duration: 200 }}>
		<div class="download-overlay-inner">
			<div class="download-overlay-header">
				<span class="font-bold text-sm">{$downloadState.displayName}</span>
				<button class="btn btn-ghost btn-xs" onclick={cancel}>Cancel</button>
			</div>
			{#if $downloadState.total > 0}
				<progress class="progress progress-primary w-full" value={$downloadState.downloaded} max={$downloadState.total}></progress>
				<div class="download-overlay-info">
					<span class="text-xs opacity-70">{downloadedLabel} of {totalLabel} ({pct}%)</span>
				</div>
			{:else}
				<button class="btn btn-ghost btn-sm loading"></button>
			{/if}
			<p class="text-xs opacity-60 mt-1">You can continue using the app. Screen won't sleep during download. If you navigate away or close the app, the download will pause and resume when you return.</p>
		</div>
	</div>
{/if}

<style>
	.download-overlay {
		flex-shrink: 0;
	}
	.download-overlay-inner {
		padding: 8px 16px 8px 16px;
		border-bottom: 1px solid rgba(0, 0, 0, 0.1);
	}
	.download-overlay-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.download-overlay-info {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
</style>
