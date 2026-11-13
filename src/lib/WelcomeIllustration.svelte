<script>
	export let feature = 0;
</script>

{#if feature === 0}
	<div
		class="ot-map-nav"
		role="img"
		aria-label="Map showing your position on the trail"
		style="height: 188px; position: relative"
	>
		<div
			style="position: absolute; left: 12px; top: 12px; height: 30px; padding: 0 10px 0 8px; border-radius: 15px; background: #0E3B32; color: #FFFFFF; display: flex; align-items: center; gap: 6px; font-size: 12px; line-height: 16px; font-weight: 700; white-space: nowrap; box-shadow: 0 2px 8px rgba(14,59,50,0.25)"
		>
			<svg
				aria-hidden="true"
				width="14"
				height="14"
				viewBox="0 0 24 24"
				fill="#8EEBB3"
				stroke="none"><path d="M12 2.5l7.5 18-7.5-4.2-7.5 4.2z"></path></svg
			>
			Mile 216.7 · Northbound
		</div>
		<div
			style="position: absolute; left: 199px; top: 11px; width: 28px; height: 28px; border-radius: 50%; box-shadow: 0 0 0 2px #FFFFFF, 0 2px 6px rgba(14,59,50,0.25)"
		>
			<div style="display: contents">
				<div
					role="img"
					aria-label="Town or resupply"
					style="width: 100%; aspect-ratio: 1 / 1; border-radius: 50%; background: #A0703F; color: #FFFFFF; display: flex; align-items: center; justify-content: center; font-family: Figtree, 'Segoe UI', system-ui, sans-serif"
				>
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						style="width: 58%; height: 58%; display: block"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						><path d="M3.5 11L12 4l8.5 7"></path><path d="M6 9.5V20h12V9.5"></path><path
							d="M10 20v-5.5h4V20"
						></path></svg
					>
				</div>
			</div>
		</div>
		<div
			style="position: absolute; left: 71px; top: 125px; width: 28px; height: 28px; border-radius: 50%; box-shadow: 0 0 0 2px #FFFFFF, 0 2px 6px rgba(14,59,50,0.25)"
		>
			<div style="display: contents">
				<div
					role="img"
					aria-label="Water"
					style="width: 100%; aspect-ratio: 1 / 1; border-radius: 50%; background: #2B87C9; color: #FFFFFF; display: flex; align-items: center; justify-content: center; font-family: Figtree, 'Segoe UI', system-ui, sans-serif"
				>
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						style="width: 58%; height: 58%; display: block"
						fill="currentColor"
						stroke="none"
						><path d="M12 3.2c3.3 4.3 6.3 7.6 6.3 11.1a6.3 6.3 0 0 1-12.6 0c0-3.5 3-6.8 6.3-11.1z"
						></path></svg
					>
				</div>
			</div>
		</div>
		<div
			style="position: absolute; left: 130px; top: 54px; width: 52px; height: 52px; border-radius: 50%; background: rgba(43,135,201,0.2); display: flex; align-items: center; justify-content: center"
		>
			<div
				style="width: 18px; height: 18px; border-radius: 50%; background: #2B87C9; box-shadow: 0 0 0 3px #FFFFFF, 0 1px 4px rgba(14,59,50,0.35)"
			></div>
		</div>
		<div
			style="position: absolute; right: 12px; bottom: 12px; height: 30px; padding: 0 10px 0 6px; border-radius: 15px; background: #FFFFFF; display: flex; align-items: center; gap: 6px; font-size: 12px; line-height: 16px; font-weight: 700; white-space: nowrap; box-shadow: 0 2px 8px rgba(14,59,50,0.18)"
		>
			<span style="width: 20px; height: 20px; flex: none"
				><div style="display: contents">
					<div
						role="img"
						aria-label="Water"
						style="width: 100%; aspect-ratio: 1 / 1; border-radius: 50%; background: #2B87C9; color: #FFFFFF; display: flex; align-items: center; justify-content: center; font-family: Figtree, 'Segoe UI', system-ui, sans-serif"
					>
						<svg
							aria-hidden="true"
							viewBox="0 0 24 24"
							style="width: 58%; height: 58%; display: block"
							fill="currentColor"
							stroke="none"
							><path d="M12 3.2c3.3 4.3 6.3 7.6 6.3 11.1a6.3 6.3 0 0 1-12.6 0c0-3.5 3-6.8 6.3-11.1z"
							></path></svg
						>
					</div>
				</div></span
			>
			Next water in 0.8 mi
		</div>
	</div>
{:else if feature === 1}
	<div
		class="ot-map-crop"
		role="img"
		aria-label="Map with waypoints along the trail"
		style="height: 188px; position: relative"
	>
		<div
			style="position: absolute; left: 230px; top: 32px; width: 28px; height: 28px; border-radius: 50%; box-shadow: 0 0 0 2px #FFFFFF, 0 2px 6px rgba(14,59,50,0.25)"
		>
			<div style="display: contents">
				<div
					role="img"
					aria-label="Alert"
					style="width: 100%; aspect-ratio: 1 / 1; border-radius: 50%; background: #D93A3A; color: #FFFFFF; display: flex; align-items: center; justify-content: center; font-family: Figtree, 'Segoe UI', system-ui, sans-serif"
				>
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						style="width: 58%; height: 58%; display: block"
						fill="none"
						stroke="currentColor"
						stroke-width="2.2"
						stroke-linecap="round"
						stroke-linejoin="round"
						><path d="M12 4L2.8 19.5h18.4z"></path><path d="M12 10v4"></path><path d="M12 17h.01"
						></path></svg
					>
				</div>
			</div>
		</div>
		<div
			style="position: absolute; left: 218px; top: 93px; width: 28px; height: 28px; border-radius: 50%; box-shadow: 0 0 0 2px #FFFFFF, 0 2px 6px rgba(14,59,50,0.25)"
		>
			<div style="display: contents">
				<div
					role="img"
					aria-label="Campsite"
					style="width: 100%; aspect-ratio: 1 / 1; border-radius: 50%; background: #2E9E6B; color: #FFFFFF; display: flex; align-items: center; justify-content: center; font-family: Figtree, 'Segoe UI', system-ui, sans-serif"
				>
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						style="width: 58%; height: 58%; display: block"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						><path d="M3 20h18"></path><path d="M12 4.5L4.5 20"></path><path d="M12 4.5L19.5 20"
						></path><path d="M12 20l-2.6-5.2h5.2z"></path></svg
					>
				</div>
			</div>
		</div>
		<div
			style="position: absolute; left: 160px; top: 140px; width: 28px; height: 28px; border-radius: 50%; box-shadow: 0 0 0 2px #FFFFFF, 0 2px 6px rgba(14,59,50,0.25)"
		>
			<div style="display: contents">
				<div
					role="img"
					aria-label="Water"
					style="width: 100%; aspect-ratio: 1 / 1; border-radius: 50%; background: #2B87C9; color: #FFFFFF; display: flex; align-items: center; justify-content: center; font-family: Figtree, 'Segoe UI', system-ui, sans-serif"
				>
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						style="width: 58%; height: 58%; display: block"
						fill="currentColor"
						stroke="none"
						><path d="M12 3.2c3.3 4.3 6.3 7.6 6.3 11.1a6.3 6.3 0 0 1-12.6 0c0-3.5 3-6.8 6.3-11.1z"
						></path></svg
					>
				</div>
			</div>
		</div>
		<div
			style="position: absolute; left: 112px; top: 150px; width: 28px; height: 28px; border-radius: 50%; box-shadow: 0 0 0 2px #FFFFFF, 0 2px 6px rgba(14,59,50,0.25)"
		>
			<div style="display: contents">
				<div
					role="img"
					aria-label="Town or resupply"
					style="width: 100%; aspect-ratio: 1 / 1; border-radius: 50%; background: #A0703F; color: #FFFFFF; display: flex; align-items: center; justify-content: center; font-family: Figtree, 'Segoe UI', system-ui, sans-serif"
				>
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						style="width: 58%; height: 58%; display: block"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						><path d="M3.5 11L12 4l8.5 7"></path><path d="M6 9.5V20h12V9.5"></path><path
							d="M10 20v-5.5h4V20"
						></path></svg
					>
				</div>
			</div>
		</div>
	</div>
{:else}
	<div
		class="ot-topo-green"
		role="img"
		aria-label="Updates from other hikers"
		style="height: 188px; box-sizing: border-box; padding: 14px 14px; position: relative; display: flex; flex-direction: column; justify-content: center; gap: 8px"
	>
		<div
			style="margin-right: 30px; background: #FFFFFF; border-radius: 14px; padding: 9px 12px 10px; box-shadow: 0 2px 8px rgba(14,59,50,0.14); display: flex; flex-direction: column; gap: 4px"
		>
			<div style="display: flex; align-items: center; gap: 7px">
				<span style="width: 22px; height: 22px; flex: none"
					><div style="display: contents">
						<div
							role="img"
							aria-label="Alert"
							style="width: 100%; aspect-ratio: 1 / 1; border-radius: 50%; background: #D93A3A; color: #FFFFFF; display: flex; align-items: center; justify-content: center; font-family: Figtree, 'Segoe UI', system-ui, sans-serif"
						>
							<svg
								aria-hidden="true"
								viewBox="0 0 24 24"
								style="width: 58%; height: 58%; display: block"
								fill="none"
								stroke="currentColor"
								stroke-width="2.2"
								stroke-linecap="round"
								stroke-linejoin="round"
								><path d="M12 4L2.8 19.5h18.4z"></path><path d="M12 10v4"></path><path
									d="M12 17h.01"
								></path></svg
							>
						</div>
					</div></span
				>
				<span style="flex: 1; font-size: 13px; line-height: 16px; font-weight: 700"
					>Detour <span style="font-weight: 500; color: #4F6B61">on Wildfire alert</span></span
				>
			</div>
			<p
				style="margin: 0; font-size: 13px; line-height: 18px; color: #24433B; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden"
			>
				The firefighters are active in this area and have warned us the trail might be closed off
				soon.
			</p>
		</div>
		<div
			style="margin-left: 30px; background: #FFFFFF; border-radius: 14px; padding: 9px 12px 10px; box-shadow: 0 2px 8px rgba(14,59,50,0.14); display: flex; flex-direction: column; gap: 4px"
		>
			<div style="display: flex; align-items: center; gap: 7px">
				<img
					src="/brand/signpost-forest.svg"
					alt=""
					style="width: 22px; height: 22px; flex: none; display: block"
				/>
				<span style="flex: 1; font-size: 13px; line-height: 16px; font-weight: 700"
					>Admin <span style="font-weight: 500; color: #4F6B61">on Grand Rapid Falls</span></span
				>
			</div>
			<p
				style="margin: 0; font-size: 13px; line-height: 18px; color: #24433B; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden"
			>
				Be safe and make sure to drink plenty of water out in the desert.
			</p>
		</div>
	</div>
{/if}

<style>
	.ot-map-nav {
		background: #e7f2e4 url(/brand/map-phone.svg) 0 -380px / 390px 844px no-repeat;
	}
	.ot-map-crop {
		background: #e7f2e4 url(/brand/map-phone.svg) -40px -230px / 390px 844px no-repeat;
	}
	.ot-topo-green {
		background: #70cf98 url(/brand/topo-on-green.svg) center / 700px auto no-repeat;
	}
</style>
