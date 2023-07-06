import { Connection } from "../transport/connection"
import { connect } from "../transport/client"
import { asError } from "../common/error"

import { createSignal, Show, createSelector, createEffect, onCleanup, createMemo } from "solid-js"

import * as Watch from "./watch"
import * as Publish from "./publish"

import { Player } from "../playback"
import { Broadcast } from "../contribute"

export function App(props: { url: string }) {
	const [connection, setConnection] = createSignal<Connection | undefined>()

	const [player, setPlayer] = createSignal<Player | undefined>()
	const [broadcast, setBroadcast] = createSignal<Broadcast | undefined>()
	const setup = createMemo(() => !player() && !broadcast())

	return (
		<div class="flex flex-col overflow-hidden rounded-lg bg-black shadow-xl ring-1 ring-gray-900/5">
			<Connecting url={props.url} setConnection={setConnection} />

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
					<Publish.Main broadcast={broadcast()!} />
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
					<Publish.Setup connection={connection()} setBroadcast={setBroadcast} />
				</div>
			</div>
		</div>
	)
}

function Connecting(props: { url: string; setConnection: (v: Connection | undefined) => void }) {
	const [state, setState] = createSignal<"connecting" | "connected" | "hidden" | "closed" | "error">("connecting")
	const [error, setError] = createSignal<Error>()

	createEffect(async () => {
		try {
			props.setConnection(undefined)
			setState("connecting")

			const connection = await connect({
				url: props.url,
				role: "both",
				fingerprint: props.url + "/fingerprint",
			})

			onCleanup(() => {
				connection.close()
			})

			props.setConnection(connection)
			setState("connected")

			// After, 3s hide the banner
			const timeout = setTimeout(() => setState("hidden"), 3000)
			onCleanup(() => clearTimeout(timeout))

			await connection.run()

			setState("closed")
		} catch (e) {
			setError(asError(e))
			setState("error")
		}
	})

	const isState = createSelector(state)

	return (
		<>
			<div
				class="overflow-hidden bg-red-400 transition-size duration-1000 ease-in-out"
				classList={{ "h-10": isState("error"), "h-0": !isState("error") }}
			>
				<Show when={error()}>
					<div class="px-4 py-2 font-bold">
						{error()?.name}: {error()!.message}
					</div>
				</Show>
			</div>
			<div
				class="overflow-hidden bg-green-400 transition-size duration-1000 ease-in-out"
				classList={{
					"h-10": isState("connected"),
					"h-0": !isState("connected"),
				}}
			>
				<div class="px-4 py-2 font-bold">Connected to {props.url}</div>
			</div>
			<div
				class="overflow-hidden bg-indigo-400 transition-size duration-1000 ease-in-out"
				classList={{
					"h-10": isState("connecting"),
					"h-0": !isState("connecting"),
				}}
			>
				<div class="px-4 py-2 font-bold">Connecting to {props.url}</div>
			</div>
			<div
				class="overflow-hidden bg-gray-400 transition-size duration-1000 ease-in-out"
				classList={{
					"h-10": isState("closed"),
					"h-0": !isState("closed"),
				}}
			>
				<div class="px-4 py-2 font-bold">Closed</div>
			</div>
		</>
	)
}
