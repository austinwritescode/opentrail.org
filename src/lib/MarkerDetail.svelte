<script>
	import {
		settings,
		data,
		fragment,
		openModal,
		errorModal,
		trailRoute,
		userMiles
	} from '$lib/store.js';
	import { register } from 'swiper/element/bundle';
	import { postGeneric } from '$lib/api.js';
	import { goto } from '$app/navigation';
	register();

	const dataIdx = $fragment.get('detail');
	$: prop = $data.features[dataIdx].properties;
	$: console.log(prop);
	let newComment = '';
	let commentSpinner = false;

	async function submitComment() {
		commentSpinner = true;
		const comment = {
			text: newComment,
			user: $settings.username,
			date: new Date(),
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
		comment.date = comment.date.toLocaleDateString();
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
					return errorModal(
						'Aspect ratio must be between 1:2 and 2:1. Crop image to be more square.'
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
							return errorModal(
								'Image too large. Try cropping the height to 400px or 500px first.'
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

<div class="modal" class:modal-open={true} on:click|self={() => (location.hash = '')}>
	<div class="modal-box rounded-lg p-4 h-4/5">
		<div class="flex justify-between items-center mb-2">
			<p class="text-md font-bold break-words">{prop.title}</p>
			<div class="flex justify-end">
				<div class="dropdown dropdown-end">
					<label tabindex="0" class="btn btn-sm btn-circle btn-ghost text-lg">⋮</label>
					<ul
						tabindex="0"
						class="menu dropdown-content p-2 shadow bg-base-300 rounded-box whitespace-nowrap"
					>
						<li>
							<a>
								<label for="upload-photo">Upload image</label>
								<!-- <input type="file" name="photo" id="upload-photo" /> -->
								<input
									style="display:none;"
									type="file"
									accept="image/*"
									id="upload-photo"
									on:change={uploadImage}
								/>
							</a>
						</li>
						<li on:click={() => editTitle(prop)}><a>Edit title</a></li>
						<li on:click={() => editDescription(prop)}><a>Edit description</a></li>
						<li
							on:click={async () => {
								await goto(`/app`);
								location.hash = `editLoc=${dataIdx}`;
							}}
						>
							<a>Edit location</a>
						</li>
						<li on:click={() => editIcons(prop)}><a>Edit icons</a></li>
						<li on:click={() => flagGeneric({}, 'flagMarker')}><a>Delete marker</a></li>
					</ul>
				</div>
				<button
					class="btn btn-sm btn-circle btn-ghost -mr-2 text-lg"
					on:click={() => (location.hash = '')}
				>
					✕
				</button>
			</div>
		</div>
		<p class="text-sm italic">
			Mile {$settings.reverseMiles
				? ($trailRoute.features[0].geometry.coordinates.length / 10 - prop.mile).toFixed(1)
				: prop.mile}&nbsp;&nbsp;&nbsp;Elev {prop.elev?.toLocaleString('en-US')}
		</p>
		<p class="text-sm italic">
			{#if prop.icons}
				{#each prop.icons as icon}
					<img src={`/map-icons/${icon}.png`} height="25" width="25" class="inline" />
				{/each}
			{/if}
			<!-- If our last geo coords were less than 16 min ago, display trail miles: -->
			{#if new Date() - $userMiles.date < 1000000}
				<span class="align-middle">
					{Math.round(Math.abs($userMiles.miles - prop.mile) * 10) / 10} trail mi away
				</span>
			{/if}
		</p>
		<p class="text-sm whitespace-pre-wrap break-words my-2">{prop.desc}</p>

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
							<img
								src="/flag.png"
								height="15"
								width="15"
								class="absolute top-1 right-1 rounded-md"
								on:click={() => flagGeneric({ image: image }, 'flagImage')}
							/>
						</div>
					</swiper-slide>
				{/each}
			</swiper-container>
		{/if}
		<div class="divider h-0 mb-2" />
		{#if $settings.username}
			<div class="form-control">
				<div class="m-2">
					<label class="input-group input-group-vertical text-sm">
						<span class="p-2 pl-4">Leave a comment:</span>
						<textarea
							class="textarea bg-base-200"
							disabled={commentSpinner}
							bind:value={newComment}
						/>
					</label>
				</div>
			</div>
		{:else}
			<div class="text-sm m-4">Enter a username in settings to comment</div>
		{/if}
		{#if newComment !== ''}
			<div class="modal-action mt-2">
				{#if commentSpinner}
					<button class="btn btn-primary loading">Submit</button>
				{:else}
					<button
						class="btn"
						on:click={() => {
							newComment = '';
						}}>Cancel</button
					>
					<button class="btn btn-primary" on:click={submitComment}>Submit</button>
				{/if}
			</div>
		{/if}
		{#each prop.comments as comment}
			<div class="chat chat-start mr-2">
				<div class="chat-header">
					<span class="text-xs">{comment.date}</span>
					<span class="opacity-60">{comment.user}</span>
				</div>
				<div class="chat-bubble whitespace-pre-wrap break-words w-full max-w-full text-sm">
					{comment.text}
				</div>
				<div class="chat-footer w-full flex justify-between">
					<div class="opacity-60">{comment.pending ? 'Pending' : ''}</div>
					<img
						src="/flag.png"
						class="rounded-md"
						height="15"
						width="15"
						on:click={() => flagGeneric({ text: comment.text }, 'flagComment')}
					/>
				</div>
			</div>
		{/each}

		<div class="modal-action m-2">
			<button class="btn" on:click={() => (location.hash = '')}>Close</button>
		</div>
	</div>
</div>
