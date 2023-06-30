import { Player } from "../playback"
import { Broadcaster } from "../broadcast"
import { Connection } from "../transport"

import { createSignal, createEffect, onMount, Show, For, Switch, Match, ErrorBoundary, createMemo } from "solid-js"
import { createStore } from "solid-js/store"

import * as Playback from "./playback"
import * as Broadcast from "./broadcast"

export function App(props: { url: string }) {
	const conn = new Connection({
		url: props.url,
		role: "both",
		fingerprint: props.url + "/fingerprint",
	})

	const player = new Player(conn)
	const broadcaster = new Broadcaster(conn)

	const [nav, setNav] = createSignal<"watch" | "broadcast" | "setup">("setup")

	return (
		<div class="flex flex-col overflow-hidden rounded-lg bg-black shadow-xl ring-1 ring-gray-900/5">
			<Notice conn={conn} player={player} />

			<Switch>
				<Match when={nav() === "setup"}>
					<div class="flex flex-row bg-white/90">
						<div class="basis-1/2 p-6">
							<Playback.Setup player={player} />
						</div>
						<div class="basis-0 border-l-2 border-dotted border-black/20"></div>
						<div class="basis-1/2 p-6">
							<Broadcast.Setup broadcaster={broadcaster} />
						</div>
					</div>
				</Match>

				<Match when={nav() === "watch"}>
					<Playback.Main player={player} />
				</Match>

				<Match when={nav() === "broadcast"}>
					<Broadcast.Main broadcaster={broadcaster} />
				</Match>
			</Switch>
		</div>
	)
}

function Notice(props: { conn: Connection; player: Player }) {
	const [state, setState] = createSignal("loading")
	const [error, setError] = createSignal<any>()

	const [hidden, setHidden] = createSignal(false)

	// Hide the notice after a few seconds when state == "connected"
	createEffect(() => {
		if (state() !== "connected") {
			return
		}

		const timeout = setTimeout(() => {
			setHidden(true)
		}, 4000)

		// Cleanup the timeout if the state changes
		return () => {
			clearTimeout(timeout)
		}
	})

	onMount(async () => {
		try {
			await props.conn.connected
			setState("handshake")
			await props.player.connected
			setState("connected")
			await props.player.running
			setState("closed")
		} catch (e) {
			setState("error")
			setError(e)
		}
	})

	return (
		<div
			class="overflow-hidden transition-all duration-1000 ease-in-out"
			classList={{ "basis-10": !hidden(), "basis-0": hidden() }}
		>
			<div
				class="px-4 py-2 font-bold transition-colors duration-1000 ease-in-out"
				classList={{
					"bg-indigo-400": state() == "loading" || state() == "handshake",
					"bg-green-400": state() == "connected",
					"bg-grey-700": state() == "closed",
					"bg-red-400": state() == "error",
				}}
			>
				<Switch>
					<Match when={error()}>Fatal: {error()}</Match>
					<Match when={state() == "loading"}>Connecting to QUIC server</Match>
					<Match when={state() == "handshake"}>Connecting to MoQ server</Match>
					<Match when={state() == "connected"}>Connected to server</Match>
					<Match when={state() == "closed"}>Connection closed</Match>
				</Switch>
			</div>
		</div>
	)
}
