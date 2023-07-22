import { connect } from "../transport/client"
import { asError } from "../common/error"

import { createSignal, createEffect, Show, createMemo } from "solid-js"

import * as Watch from "./watch"
import * as Publish from "./publish"

import { Player } from "../playback/player"
import { Broadcast } from "../contribute/broadcast"
import { Connection } from "../transport/connection"

export function App(props: { url: string }) {
	const [error, setError] = createSignal<Error | undefined>()
	const [connection, setConnection] = createSignal<Connection | undefined>()

	const fingerprint = process.env.NODE_ENV !== "production" ? props.url + "/fingerprint" : undefined

	createEffect(async () => {
		try {
			const conn = await connect({
				url: props.url,
				role: "both",
				fingerprint,
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
			<div class="flex flex-col overflow-hidden transition-size duration-1000" classList={{ "h-0": !player() }}>
				<Show when={player()}>
					<Watch.Main player={player()!} setError={setError} setPlayer={setPlayer} />
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
					<p class="mb-6 text-center font-mono text-xl">Watch</p>
					<Show when={connection()} fallback="Connecting...">
						<Watch.Setup connection={connection()!} setPlayer={setPlayer} setError={setError} />
					</Show>
				</div>
				<div class="basis-0 border-l-2 border-dotted border-black/20"></div>
				<div class="basis-1/2 p-6">
					<p class="mb-6 text-center font-mono text-xl">Publish</p>
					<Publish.Setup connection={connection()} setBroadcast={setBroadcast} setError={setError} />
				</div>
			</div>
		</div>
	)
}
