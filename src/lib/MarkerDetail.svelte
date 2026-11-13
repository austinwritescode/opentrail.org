<script>
	let photoInput;
	import WaypointBadge from './WaypointBadge.svelte';
	import { waypointKinds } from './waypoint-icons.js';
	import Icon from './Icon.svelte';
	import { dialogFocus } from './dialogFocus.js';
	import { dragToClose } from './dragToClose.js';
	import {
		settings,
		data,
		detailId,
		editLocId,
		editLocNewMarker,
		openModal,
		handleError,
		trailRoute,
		userMiles,
		centerOnMarkerId,
		skipHistorySync
	} from '$lib/store.js';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { register } from 'swiper/element/bundle';
	import { postGeneric } from '$lib/api.js';
	import { parseDescURL, isSafeURL, mToFt, ftToM, formatDist, formatElev } from '$lib/helpers.js';
	import dayjs from 'dayjs';
	register();

	export let onPrev;
	export let onNext;
	$: dataIdx = $detailId;
	$: prop = $data.features[dataIdx].properties;
	$: imp = $settings.units !== 'metric';
	$: totalMiles = $trailRoute.features?.[0]?.geometry.coordinates.length / 10;
	$: displayMile =
		$settings.reverseMiles && totalMiles != null ? totalMiles - prop.mile : Number(prop.mile);
	$: userCoords = $trailRoute.features?.[0]?.geometry.coordinates;
	$: userIdx = Math.round($userMiles.miles * 10);
	$: userElevFt = userCoords?.[userIdx]?.[2] != null ? mToFt(userCoords[userIdx][2]) : null;
	$: mileDiff = Math.round(Math.abs($userMiles.miles - Number(prop.mile)) * 10) / 10;
	$: mileSign = $settings.reverseMiles
		? $userMiles.miles >= Number(prop.mile)
			? '+'
			: '-'
		: Number(prop.mile) >= $userMiles.miles
			? '+'
			: '-';
	$: elevDiffFt =
		userElevFt != null && prop.elev != null
			? Math.round(Math.abs(userElevFt - Number(prop.elev)))
			: null;
	$: elevSign =
		userElevFt != null && prop.elev != null ? (Number(prop.elev) >= userElevFt ? '+' : '-') : '';
	$: userRecent = new Date() - $userMiles.date < 1000000;
	let newComment = '';
	let commentSpinner = false;
	let scrollContainer;
	$: if ($detailId >= 0) scrollContainer?.scrollTo(0, 0);

	async function submitComment() {
		commentSpinner = true;
		const comment = {
			text: newComment,
			user: $settings.username,
			date: new Date().toLocaleDateString('en-CA'),
			markerId: prop.dbid
		};
		const item = { route: 'postComment', data: comment };
		let success = false;
		try {
			success = await postGeneric(item);
		} catch (e) {
			return (commentSpinner = false); //otherwise do nothing
		}
		// whether we posted or pended, do this local data processing:
		$data.features[dataIdx].properties.comments.unshift({ ...comment, pending: !success });
		prop = $data.features[dataIdx].properties;
		newComment = '';
		commentSpinner = false;
	}

	function editTitle(prop) {
		openModal({
			type: 'text',
			data: ['Marker title', prop.title],
			spinner: true,
			submit: async (data) => {
				await postGeneric({
					route: 'postMarker?type=editTitle',
					data: { dbid: prop.dbid, payload: data[1] }
				});
			}
		});
	}

	function editDescription(prop) {
		openModal({
			type: 'textArea',
			data: ['Marker description', prop.desc],
			spinner: true,
			submit: async (data) => {
				await postGeneric({
					route: 'postMarker?type=editDesc',
					data: { dbid: prop.dbid, payload: data[1] }
				});
			}
		});
	}

	function editIcons(prop) {
		openModal({
			type: 'editIcons',
			data: prop.icons,
			spinner: true,
			submit: async (data) => {
				await postGeneric({
					route: 'postMarker?type=editIcons',
					data: { dbid: prop.dbid, payload: data }
				});
			}
		});
	}

	function flagGeneric(additionalData, type) {
		openModal({
			type: 'text',
			data: ['Why should this be removed?'],
			spinner: true,
			submit: async (data) => {
				await postGeneric({
					route: `postFlag?type=${type}`,
					data: {
						markerId: prop.dbid,
						reason: data[1],
						...additionalData
					}
				});
			}
		});
	}

	function uploadImage(e) {
		let image = e.target.files[0];
		let reader = new FileReader();
		reader.onload = () => {
			image = new Image();
			image.src = reader.result;
			image.onload = () => {
				console.log(`Processing image. Width: ${image.width} height: ${image.height}`);
				const aspectRatio = image.width / image.height;
				if (aspectRatio > 2 || aspectRatio < 0.5)
					return handleError(
						new Error('Aspect ratio must be between 1:2 and 2:1. Crop image to be more square.'),
						{ modal: true, sentry: false }
					);
				let newWidth = image.width;
				let newHeight = image.height;
				if (image.height > 600) {
					newWidth = image.width * (600 / image.height);
					newHeight = 600;
					console.log(`Resizing image. Width: ${newWidth} height: ${newHeight}`);
				}

				let canvas = document.createElement('canvas');
				canvas.width = newWidth;
				canvas.height = newHeight;
				var context = canvas.getContext('2d');
				context.drawImage(image, 0, 0, newWidth, newHeight);
				canvas.toBlob(
					(blob) => {
						if (blob.size > 100000)
							return handleError(
								new Error('Image too large. Try cropping the height to 400px or 500px first.'),
								{ modal: true, sentry: false }
							);
						postGeneric({ route: `postImage?id=${prop.dbid}`, data: blob });
					},
					'image/jpeg',
					0.5
				);
			};
		};
		reader.readAsDataURL(image);
	}
</script>

<div
	class="modal waypoint-detail"
	class:modal-open={true}
	onclick={(e) => e.target === e.currentTarget && ($detailId = -1)}
>
	<div class="marker-sheet relative max-w-[32rem] w-[91.666667%] mx-auto">
		<div
			use:dialogFocus={() => ($detailId = -1)}
			role="dialog"
			aria-modal="true"
			aria-label={prop.title}
			tabindex="-1"
			class="modal-box rounded-lg p-4 h-[90vh] select-text overflow-x-hidden overflow-y-hidden flex flex-col w-full max-w-none"
		>
			<div class="detail-toolbar">
				<button
					type="button"
					class="sheet-drag-handle"
					aria-label="Close waypoint details by dragging down or activating this handle"
					use:dragToClose={() => ($detailId = -1)}
					><span class="sheet-handle" aria-hidden="true"></span></button
				>
				<div class="detail-title">
					<WaypointBadge kind={prop.icon} size={32} />
					<div class="detail-heading-copy">
						<h2>{prop.title}</h2>
						<p class="detail-meta">
							{(waypointKinds[prop.icon] || waypointKinds.o).label.split(' / ')[0]} &middot; {#if imp}Mile
								{displayMile.toFixed(
									1
								)}{#if userRecent}&nbsp;({mileSign}{mileDiff}){/if}{:else}{formatDist(
									displayMile,
									false,
									1
								)}{#if userRecent}&nbsp;({mileSign}{formatDist(mileDiff, false, 1)}){/if}{/if} &middot;
							{#if imp}{prop.elev?.toLocaleString('en-US')} ft{#if userRecent && elevDiffFt != null}&nbsp;({elevSign}{elevDiffFt}'){/if}{:else}
								{formatElev(
									prop.elev != null ? ftToM(prop.elev) : null,
									false
								)}{#if userRecent && elevDiffFt != null}&nbsp;({elevSign}{Math.round(
										ftToM(elevDiffFt)
									)}m){/if}{/if}
						</p>
					</div>
				</div>
				<div class="flex justify-end">
					<div class="dropdown dropdown-end">
						<button type="button" aria-label="More waypoint options" class="icon-button detail-more"
							><Icon name="more-vertical" /></button
						>
						<ul
							tabindex="0"
							class="menu dropdown-content p-2 shadow bg-base-300 rounded-box whitespace-nowrap"
						>
							<li
								onclick={() => {
									const url = `${window.location.origin}/app?trail=${$settings.trail}&marker=${prop.dbid}`;
									navigator.clipboard.writeText(url);
								}}
							>
								<a>Copy share link</a>
							</li>
							<li
								onclick={() => {
									const c = $data.features[dataIdx].geometry.coordinates;
									window.open(
										`https://www.google.com/maps/search/?api=1&query=${c[1]},${c[0]}`,
										'_blank'
									);
								}}
							>
								<a>Open in Google Maps</a>
							</li>
							{#if $page.url.pathname === '/app/list'}
								<li
									onclick={() => {
										$skipHistorySync = true;
										$centerOnMarkerId = dataIdx;
										$detailId = -1;
										goto('/app').finally(() => {
											$skipHistorySync = false;
										});
									}}
								>
									<a>Show on map</a>
								</li>
							{/if}
							<li>
								<a>
									<label for="upload-photo">Upload image</label>
									<input
										style="display:none;"
										type="file"
										accept="image/*"
										id="upload-photo"
										bind:this={photoInput}
										onchange={uploadImage}
									/>
								</a>
							</li>
							<li onclick={() => editTitle(prop)}><a>Edit title</a></li>
							<li onclick={() => editDescription(prop)}><a>Edit description</a></li>
							<li
								onclick={() => {
									$editLocId = dataIdx;
									$editLocNewMarker = false;
								}}
							>
								<a>Edit location</a>
							</li>
							<li onclick={() => editIcons(prop)}><a>Edit icons</a></li>
							<li onclick={() => flagGeneric({}, 'flagMarker')}><a>Delete marker</a></li>
						</ul>
					</div>
					<button
						class="icon-button"
						aria-label="Close waypoint details"
						onclick={() => ($detailId = -1)}><Icon name="close" size={20} /></button
					>
				</div>
			</div>

			<div
				class="detail-scroll flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
				bind:this={scrollContainer}
			>
				<p class="text-sm whitespace-pre-wrap break-words my-2">
					{#each parseDescURL(prop.desc) as token}
						{#if token.startsWith('http://') || token.startsWith('https://')}
							{#if isSafeURL(token)}
								<a href={token} class="link" target="_blank" rel="noopener noreferrer">{token}</a>
							{:else}{token}{/if}
						{:else if token.startsWith('www.')}
							<a href={'https://' + token} class="link" target="_blank" rel="noopener noreferrer"
								>{token}</a
							>
						{:else}{token}{/if}
					{/each}
				</p>

				{#if prop.images.length > 0}
					<swiper-container
						class="w-full h-52 mt-4"
						slides-per-view={'auto'}
						centered-slides={true}
						space-between={10}
						pagination={true}
						pagination-clickable={true}
						zoom={true}
					>
						{#each prop.images as image}
							<swiper-slide lazy={true} class="w-fit">
								<div class="swiper-zoom-container">
									<img
										src={`https://cdn.opentrail.org/img/${image}.jpg`}
										class="h-full w-auto"
										loading="lazy"
									/>
									<button
										class="absolute top-1 right-1 rounded-md"
										onclick={() => flagGeneric({ image: image }, 'flagImage')}
									>
										<svg
											width="15"
											height="15"
											viewBox="0 0 24 24"
											fill="currentColor"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											><line x1="5" y1="2" x2="5" y2="22" /><path
												d="M5 2h10l-2.5 4.5L15 11H5z"
											/></svg
										>
									</button>
								</div>
							</swiper-slide>
						{/each}
					</swiper-container>
				{/if}

				<h3 class="detail-comments-heading">
					Comments <span class="muted">&middot; {prop.comments.length}</span>
				</h3>
				{#if $settings.username}
					<div class="form-control">
						<div class="m-2">
							<label class="input-group input-group-vertical text-sm">
								<span class="p-2 pl-4">Leave a comment:</span>
								<textarea
									class="textarea bg-base-200"
									disabled={commentSpinner}
									bind:value={newComment}
								></textarea>
							</label>
						</div>
					</div>
				{:else}
					<a class="comment-signin" href="/app/settings" onclick={() => ($detailId = -1)}
						>Set your username in Settings to leave a comment <Icon name="chevron" size={16} /></a
					>
				{/if}
				{#if newComment !== ''}
					<div class="modal-action mt-2">
						{#if commentSpinner}
							<button class="btn btn-primary loading">Submit</button>
						{:else}
							<button
								class="btn"
								onclick={() => {
									newComment = '';
								}}>Cancel</button
							>
							<button class="btn btn-primary" onclick={submitComment}>Submit</button>
						{/if}
					</div>
				{/if}
				{#each prop.comments as comment}
					<div class="detail-comment">
						<span class="comment-avatar">{(comment.user || 'H').slice(0, 1).toUpperCase()}</span>
						<div class="detail-comment-copy">
							<div class="comment-author">
								<span class="text-xs">{dayjs(comment.date).format($settings.dateFormat)}</span>
								<span class="opacity-60">{comment.user}</span>
							</div>
							<div class="comment-text whitespace-pre-wrap break-words">
								{comment.text}
							</div>
							<div class="chat-footer w-full flex justify-between">
								<div class="opacity-60">{comment.pending ? 'Pending' : ''}</div>
								<button
									class="icon-button report-comment"
									aria-label="Report comment"
									onclick={() => flagGeneric({ text: comment.text }, 'flagComment')}
								>
									<svg
										width="15"
										height="15"
										viewBox="0 0 24 24"
										fill="currentColor"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										><line x1="5" y1="2" x2="5" y2="22" /><path
											d="M5 2h10l-2.5 4.5L15 11H5z"
										/></svg
									>
								</button>
							</div>
						</div>
					</div>
				{/each}
			</div>
			<div class="detail-actions detail-footer" aria-label="Waypoint actions">
				<button
					class="icon-button"
					aria-label="Previous marker"
					disabled={!onPrev}
					onclick={() => onPrev?.()}><Icon name="chevron-left" size={20} /></button
				>
				<button
					class="btn btn-primary"
					onclick={() => {
						$skipHistorySync = true;
						$centerOnMarkerId = dataIdx;
						$detailId = -1;
						goto('/app').finally(() => ($skipHistorySync = false));
					}}><Icon name="map" /> View on map</button
				><button
					type="button"
					class="icon-button"
					aria-label="Upload photo"
					onclick={() => photoInput?.click()}><Icon name="camera" /></button
				>
				<button
					class="icon-button"
					aria-label="Next marker"
					disabled={!onNext}
					onclick={() => onNext?.()}><Icon name="chevron-right" size={20} /></button
				>
			</div>
		</div>
	</div>
</div>
