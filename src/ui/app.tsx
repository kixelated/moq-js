import { connect } from "../transport/client"
import { asError } from "../common/error"

import { createSignal, createEffect, Show, createMemo } from "solid-js"

import * as Watch from "./watch"
import * as Publish from "./publish"

import { Player } from "../playback"
import { Broadcast } from "../contribute"
import { Connection } from "../transport/connection"

export function App(props: { url: string }) {
	const [error, setError] = createSignal<Error | undefined>()
	const [connection, setConnection] = createSignal<Connection | undefined>()

	createEffect(async () => {
		try {
			const conn = await connect({
				url: props.url,
				role: "both",
				fingerprint: props.url + "/fingerprint",
			})

			setConnection(conn)
			await conn.run()
		} catch (e) {
			setError(asError(e))
		} finally {
			setConnection()
		}
	})

	createEffect(() => {
		const err = error()
		if (err) console.error(err)
	})

	const [player, setPlayer] = createSignal<Player | undefined>()
	const [broadcast, setBroadcast] = createSignal<Broadcast | undefined>()
	const setup = createMemo(() => !player() && !broadcast())

	return (
		<div class="flex flex-col overflow-hidden rounded-lg bg-black shadow-xl ring-1 ring-gray-900/5">
			<Show when={error()}>
				<div class="bg-red-400 px-4 py-2 font-bold">
					{error()?.name}: {error()?.message}
				</div>
			</Show>
			<div
				class="flex flex-col overflow-hidden transition-size duration-1000"
				classList={{ "h-[500]": !!player(), "h-0": !player() }}
			>
				<Show when={player()}>
					<Watch.Main player={player()!} />
				</Show>
			</div>

			<div
				class="flex flex-col overflow-hidden transition-size duration-1000"
				classList={{ "h-[500]": !!broadcast(), "h-0": !broadcast() }}
			>
				<Show when={broadcast()}>
					<Publish.Main broadcast={broadcast()!} setBroadcast={setBroadcast} setError={setError} />
				</Show>
			</div>

			<div
				class="flex flex-row bg-white/90 transition-size duration-1000"
				classList={{ "h-96": setup(), "h-0": setup() }}
			>
				<div class="basis-1/2 p-6">
					<Watch.Setup connection={connection()} setPlayer={setPlayer} />
				</div>
				<div class="basis-0 border-l-2 border-dotted border-black/20"></div>
				<div class="basis-1/2 p-6">
					<Publish.Setup connection={connection()} setBroadcast={setBroadcast} setError={setError} />
				</div>
			</div>
		</div>
	)
}
