import { Client, Connection } from "@kixelated/moq/transport"

import { For, Show, Switch, Match, createMemo, createEffect, onCleanup } from "solid-js"
import {
	AudioCatalogTrack,
	Catalog,
	VideoCatalogTrack,
	isAudioCatalogTrack,
	isVideoCatalogTrack,
} from "@kixelated/moq/media"
import { A, useSearchParams } from "@solidjs/router"
import { createFetch, createRunner } from "./common"

export function Listings() {
	const [params] = useSearchParams<{ server?: string }>()
	const server = params.server ?? process.env.RELAY_HOST

	const connection = createRunner<Connection, string>(async (setConnection, server) => {
		const url = `https://${server}`

		// Special case localhost to fetch the TLS fingerprint from the server.
		// TODO remove this when WebTransport correctly supports self-signed certificates
		const fingerprint = server.startsWith("localhost") ? url + "/fingerprint" : undefined

		const client = new Client({
			url: `https://${server}`,
			fingerprint,
			role: "subscriber",
		})

		const connection = await client.connect()
		setConnection(connection)

		throw await connection.closed()
	}, server) // connect on page load

	createEffect(() => {
		// Close the connection when the component is unmounted.
		onCleanup(() => connection()?.close())
	})

	const broadcasts = createRunner<string[], Connection>(async (set, connection) => {
		let [announced, next] = connection.announced().value()
		set(announced.map((a) => a.namespace))

		while (next) {
			;[announced, next] = await next
			set(announced.map((a) => a.namespace))
		}
	}, connection)

	const error = createMemo(() => connection.error() || broadcasts.error())

	return (
		<>
			<p class="p-3">
				Watch a <b class="text-green-500">PUBLIC</b> broadcast. Report any abuse pls.
			</p>

			<Show when={error()}>
				<div class="rounded-md bg-red-600 px-4 py-2 font-bold">
					{error()!.name}: {error()!.message}
				</div>
			</Show>

			<header class="mt-6 border-b-2 border-green-600 pl-3 text-xl">Public</header>
			<For
				each={broadcasts()}
				fallback={
					<p class="p-4">
						No live broadcasts. Somebody should <A href="/publish">PUBLISH</A>.
					</p>
				}
			>
				{(broadcast) => {
					const catalog = createFetch(async (connection) => {
						return await Catalog.fetch(connection, broadcast)
					}, connection)

					return <Listing server={server} name={broadcast} catalog={catalog()} />
				}}
			</For>
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

export function Listing(props: { server: string; name: string; catalog?: Catalog }) {
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
			<A href={watchUrl()} class="text-xl">
				{props.name}
			</A>
			<div class="ml-4 text-xs italic text-gray-300">
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
			</div>
		</div>
	)
}
