<script>
	import { env } from '$env/dynamic/public';

	const isStaging = env.PUBLIC_IS_STAGING === 'true';
</script>

{#if isStaging}
	<div class="staging-banner" role="note">DEV SERVER - FOR TESTING ONLY - DATA OUT OF DATE AND NOT PERSISTENT</div>
{/if}

<style>
	.staging-banner {
		flex: none;
		background: #cc0000;
		color: #ffffff;
		font-size: 11px;
		line-height: 1;
		letter-spacing: 0.04em;
		text-align: center;
		text-transform: uppercase;
		padding: 3px 8px;
	}
</style>
