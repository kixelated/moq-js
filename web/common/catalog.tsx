import { Catalog, CatalogTrack, isAudioCatalogTrack, isVideoCatalogTrack } from "@kixelated/moq/common"
import { Connection } from "@kixelated/moq/transport"
import { For, Show } from "solid-js"

export function Listing(props: {
	name: string
	catalog: Catalog
	connection: Connection
	click?: (e: MouseEvent) => void
}) {
	// A function because Match doesn't work with Typescript type guards
	const trackInfo = (track: CatalogTrack) => {
		if (isVideoCatalogTrack(track)) {
			return (
				<>
					video: {track.codec} {track.width}x{track.height}
					<Show when={track.bit_rate}> {(track.bit_rate! / 1000000).toFixed(1) + " mb/s"}</Show>
				</>
			)
		} else if (isAudioCatalogTrack(track)) {
			return (
				<>
					audio: {track.codec} {track.sample_rate}Hz {track.channel_count}ch
					<Show when={track.bit_rate}> {Math.round(track.bit_rate! / 1000) + "kb/s"}</Show>
				</>
			)
		} else {
			return "unknown track type"
		}
	}

	const trackParams = () => {
		const config = props.connection.client.config
		return { name: props.name, server: config?.url, local: !!config?.fingerprint }
	}

	return (
		<div>
			<a href={"watch?" + objectToParams(trackParams())} onClick={props.click} class="text-xl">
				{props.name.replace(/\//, " / ")}
			</a>
			<div class="ml-4 text-xs italic text-gray-300">
				<For each={props.catalog.tracks}>
					{(track) => {
						return <div>{trackInfo(track)}</div>
					}}
				</For>
			</div>
		</div>
	)
}

function objectToParams(obj: { [key: string]: string | number | boolean | undefined }): string {
	return Object.entries(obj)
		.filter(([, value]) => value !== undefined)
		.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value!)}`)
		.join("&")
}
