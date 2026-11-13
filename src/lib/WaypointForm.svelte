<script>
	import { dialogFocus } from './dialogFocus.js';
	import Icon from './Icon.svelte';
	import WaypointBadge from './WaypointBadge.svelte';
	import { waypointKinds } from './waypoint-icons.js';
	export let onclose;
	export let onsubmit;
	let title = '';
	let desc = '';
	let comment = '';
	let icons = 'c';
</script>

<div
	class="modal modal-open modal-bottom sm:modal-middle"
	role="presentation"
	onclick={(e) => {
		if (e.target === e.currentTarget) onclose();
	}}
>
	<div
		use:dialogFocus={onclose}
		class="modal-box waypoint-form"
		role="dialog"
		aria-modal="true"
		aria-labelledby="add-waypoint-title"
		tabindex="-1"
	>
		<div class="sheet-handle"></div>
		<header class="page-heading">
			<h2 id="add-waypoint-title">Add a waypoint</h2>
			<button class="icon-button" aria-label="Close" onclick={onclose}><Icon name="close" /></button
			>
		</header>
		<p class="muted">Share something useful with the next hiker.</p>
		<form
			onsubmit={(e) => {
				e.preventDefault();
				if (title.trim() && icons)
					onsubmit({
						title: title.trim(),
						desc: desc.trim(),
						comment: comment.trim(),
						icon: icons[0],
						icons,
						images: []
					});
			}}
		>
			<label class="field-label"
				>Name<input
					class="input input-bordered w-full"
					placeholder="What is this place called?"
					bind:value={title}
					required
					maxlength="200"
				/></label
			>
			<fieldset>
				<legend class="field-label">Waypoint type</legend>
				<div class="type-grid">
					{#each Object.entries(waypointKinds) as [kind, badge]}<button
							type="button"
							class:chosen={icons.includes(kind)}
							aria-pressed={icons.includes(kind)}
							onclick={() =>
								(icons = icons.includes(kind) ? icons.replace(kind, '') : icons + kind)}
							><WaypointBadge {kind} size={32} /><span>{badge.label}</span></button
						>{/each}
				</div>
			</fieldset>
			<label class="field-label"
				>Description<textarea
					class="textarea textarea-bordered w-full"
					rows="3"
					placeholder="Permanent details, access, or directions"
					bind:value={desc}
				></textarea></label
			>
			<label class="field-label"
				>Current conditions <span class="muted">(optional)</span><textarea
					class="textarea textarea-bordered w-full"
					rows="2"
					placeholder="Water flow, closures, or a recent observation"
					bind:value={comment}
				></textarea></label
			>
			<p class="muted text-sm">Next, position your waypoint on the map before saving.</p>
			<div class="modal-action">
				<button type="button" class="btn btn-ghost" onclick={onclose}>Cancel</button><button
					class="btn btn-primary"
					disabled={!title.trim() || !icons}>Choose location <Icon name="pin" size={18} /></button
				>
			</div>
		</form>
	</div>
</div>
