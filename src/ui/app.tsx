import { Player } from "../playback"
import { Broadcaster } from "../broadcast"
import { Connection } from "../transport"

import {
	createSignal,
	JSX,
	createEffect,
	onMount,
	Show,
	For,
	Switch,
	Match,
	ErrorBoundary,
	createMemo,
	onCleanup,
	catchError,
} from "solid-js"
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

	const [nav, setNav] = createSignal("setup")

	return (
		<div class="flex flex-col overflow-hidden rounded-lg bg-black shadow-xl ring-1 ring-gray-900/5">
			<Notice conn={conn} player={player}>
				<Playback.Main active={nav() === "playback"} player={player} />
				<Broadcast.Main active={nav() === "broadcast"} broadcaster={broadcaster} />
				<Setup active={nav() === "setup"} select={setNav} player={player} broadcaster={broadcaster} />
			</Notice>
		</div>
	)
}

function Notice(props: { conn: Connection; player: Player; children: JSX.Element }) {
	const [error, setError] = createSignal<any>()

	const [state, setState] = createSignal("loading")
	const [hidden, setHidden] = createSignal(false)

	// Hide the notice after a few seconds when state == "connected"
	createEffect(() => {
		if (error() || state() !== "connected") {
			return
		}

		const timeout = setTimeout(() => {
			setHidden(true)
		}, 3000)

		// Cleanup the timeout if the state changes
		onCleanup(() => {
			clearTimeout(timeout)
		})
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
			setError(e)
		}
	})

	return (
		<>
			<div
				class="overflow-hidden transition-size duration-1000 ease-in-out"
				classList={{ "h-10": !hidden(), "h-0": hidden() }}
			>
				<div
					class="px-4 py-2 font-bold transition-colors duration-1000 ease-in-out"
					classList={{
						"bg-indigo-400": state() == "loading" || state() == "handshake",
						"bg-green-400": state() == "connected",
						"bg-grey-700": state() == "closed",
						"bg-red-400": error(),
					}}
				>
					<Switch>
						<Match when={error()}>{error() + ""}</Match>
						<Match when={state() == "loading"}>Connecting to QUIC server</Match>
						<Match when={state() == "handshake"}>Connecting to MoQ server</Match>
						<Match when={state() == "connected"}>Connected to server</Match>
						<Match when={state() == "closed"}>Connection closed</Match>
					</Switch>
				</div>
			</div>
			{catchError(
				() => props.children,
				(e) => setError(e)
			)}
		</>
	)
}

function Setup(props: { active: boolean; select: (name: string) => void; player: Player; broadcaster: Broadcaster }) {
	return (
		<div
			class="flex flex-row bg-white/90 transition-size duration-1000"
			classList={{ "h-96": props.active, "h-0": !props.active }}
		>
			<div class="basis-1/2 p-6">
				<Playback.Setup start={props.select.bind(null, "playback")} player={props.player} />
			</div>
			<div class="basis-0 border-l-2 border-dotted border-black/20"></div>
			<div class="basis-1/2 p-6">
				<Broadcast.Setup select={props.select.bind(null, "broadcast")} broadcaster={props.broadcaster} />
			</div>
		</div>
	)
}
