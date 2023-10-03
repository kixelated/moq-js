import { For, Match, Switch } from "solid-js"
import { Catalog, isAudioCatalogTrack, isVideoCatalogTrack } from "@kixelated/moq/media"
import type { CatalogTrack } from "@kixelated/moq/media"

export function Listing(props: { name: string; server?: string; catalog?: Catalog }) {
	const watchUrl = () => {
		return `/watch/${props.name}/${props.server ?? ""}`
	}

	return (
		<div class="p-4">
			<a href={watchUrl()} class="text-xl" target="_blank" rel="noreferrer">
				{props.name}
			</a>
			<Tracks catalog={props.catalog} />
		</div>
	)
}

function Tracks(props: { catalog?: Catalog }) {
	return (
		<div class="ml-4 text-xs italic text-gray-300">
			<For each={props.catalog?.tracks}>
				{(track) => (
					<p>
						<Track track={track} />
					</p>
				)}
			</For>
		</div>
	)
}

function matches<S extends T, T = unknown>(e: T, predicate: (e: T) => e is S): S | false {
	return predicate(e) ? e : false
}

function Track(props: { track: CatalogTrack }) {
	return (
		<Switch fallback="unknown">
			<Match when={matches(props.track, isVideoCatalogTrack)}>
				{(track) => {
					const bitrate = track().bit_rate
					return (
						<>
							video: {track().codec} {track().width}x{track().height}{" "}
							{bitrate ? (bitrate / 1_000_000).toFixed(1) + " mb/s" : ""}
						</>
					)
				}}
			</Match>
			<Match when={matches(props.track, isAudioCatalogTrack)}>
				{(track) => {
					const bitrate = track().bit_rate
					return (
						<>
							audio: {track().codec} {track().sample_rate}Hz {track().channel_count}ch{" "}
							{bitrate ? (bitrate / 1_000).toFixed(1) + " kb/s" : ""}
						</>
					)
				}}
			</Match>
		</Switch>
	)
}
