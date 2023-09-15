import { For, Show, Switch, Match } from "solid-js"
import {
	AudioCatalogTrack,
	Catalog,
	VideoCatalogTrack,
	isAudioCatalogTrack,
	isVideoCatalogTrack,
} from "@kixelated/moq/media"
import { A } from "@solidjs/router"

export function Listings() {
	return (
		<>
			<p class="p-4">
				Watch a <strong>PUBLIC</strong> broadcast. Report any abuse pls.
			</p>

			<header>Public</header>
			<p class="p-2">
				Public broadcasts will be listed here; we're <A href="/issues">busy</A> setting up the CDN.
			</p>
			<p class="p-2">
				In the meantime, <A href="/publish">PUBLISH</A> and share the resulting link.
			</p>
		</>
	)
}

/* TODO manual broadcast selection
	<form class="grid grid-cols-3 items-center gap-3 text-sm">
		<header class="col-span-3 mt-6 border-b-2 border-green-600 pl-3 text-xl">Private</header>
		<label for="server" class="col-start-1 p-2">
			Server
		</label>
		<input
			type="text"
			name="server"
			placeholder={process.env.RELAY_HOST}
			class="col-span-2 flex-grow rounded-md border-0 bg-slate-700 text-sm shadow-sm focus:ring-1 focus:ring-inset focus:ring-green-600"
			value={params.server || ""}
			onInput={(e) => setParams({ server: e.target.value })}
		/>

		<label for="name" class="col-start-1 p-2">
			Name
		</label>
		<input
			type="text"
			name="name"
			class="col-span-2 flex-grow rounded-md border-0 bg-slate-700 text-sm shadow-sm focus:ring-1 focus:ring-inset focus:ring-green-600"
			value={name()}
			onInput={(e) => setName(e.target.value)}
		/>

		<button
			class="col-start-2 rounded-md bg-green-600 p-2 font-semibold shadow-sm hover:bg-green-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
			type="submit"
		>
			Load
		</button>
	</form>
*/

export function Listing(props: { server?: string; name: string; catalog?: Catalog }) {
	function audioTrack(track: AudioCatalogTrack) {
		return (
			<>
				audio: {track.codec} {track.sample_rate}Hz {track.channel_count}ch
				<Show when={track.bit_rate}> {Math.round(track.bit_rate! / 1000) + "kb/s"}</Show>
			</>
		)
	}

	function videoTrack(track: VideoCatalogTrack) {
		return (
			<>
				video: {track.codec} {track.width}x{track.height}
				<Show when={track.bit_rate}> {(track.bit_rate! / 1000000).toFixed(1) + " mb/s"}</Show>
			</>
		)
	}

	function watchUrl() {
		let url = "/watch/" + props.name
		if (props.server && props.server !== process.env.RELAY_HOST) url += "?server=" + props.server
		return url
	}

	return (
		<div class="p-4">
			<a href={watchUrl()} class="text-xl" target="_blank">
				{props.name}
			</a>
			<div class="ml-4 text-xs italic text-gray-300">
				<Show when={props.catalog} fallback="loading...">
					<For each={props.catalog?.tracks}>
						{(track) => (
							<p>
								<Switch fallback="unknown track">
									<Match when={isVideoCatalogTrack(track)}>
										{videoTrack(track as VideoCatalogTrack)}
									</Match>
									<Match when={isAudioCatalogTrack(track)}>
										{audioTrack(track as AudioCatalogTrack)}
									</Match>
								</Switch>
							</p>
						)}
					</For>
				</Show>
			</div>
		</div>
	)
}
