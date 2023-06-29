import { Broadcaster, Player } from "~/main"
import { Connection } from "~/transport"

import { createSignal, onMount, Show, For, Switch, Match, ErrorBoundary, createMemo } from "solid-js"
import { createStore } from "solid-js/store"

import * as Playback from "./playback"
import * as Broadcast from "./broadcast"

export function App(props: { url: string }) {
	const canvas = <canvas width="854" height="480" class="aspect-video bg-black"></canvas>
	const offscreen = (canvas as HTMLCanvasElement).transferControlToOffscreen()

	const conn = new Connection({
		url: props.url,
		role: "both",
		fingerprint: props.url + "/fingerprint",
	})

	const player = new Player(conn, offscreen)
	const broadcaster = new Broadcaster(conn)

	return (
		<div class="relative flex flex-col overflow-hidden rounded-lg bg-black shadow-xl ring-1 ring-gray-900/5">
			<Notice conn={conn} player={player} />
			{canvas}
			<Playback.Main player={player} />
			<Broadcast.Main broadcaster={broadcaster} />
			<Settings player={player} broadcaster={broadcaster} />
		</div>
	)
}

function Notice(props: { conn: Connection; player: Player }) {
	const [state, setState] = createSignal("loading")
	const [error, setError] = createSignal<any>()

	onMount(async () => {
		try {
			await new Promise((resolve) => setTimeout(resolve, 1000))
			await props.conn.connected
			setState("handshake")
			await props.player.connected
			setState("connected")
			await new Promise((resolve) => setTimeout(resolve, 1000)) // show connected for a second
			setState("hidden")
			await props.player.running
			setState("closed")
		} catch (e) {
			setState("error")
			setError(e)
		}
	})

	//class="border-grey-700 bg-grey-400 border-b-2 px-4 py-2 font-bold"

	return (
		<div
			class="px-4 py-2 font-bold transition-colors duration-1000 ease-in-out"
			classList={{
				"bg-indigo-400": state() == "loading" || state() == "handshake",
				"bg-green-400": state() == "connected",
				"bg-grey-400": state() == "closed",
				"bg-red-400": state() == "error",
			}}
		>
			<Switch>
				<Match when={error()}>
					{""} {error()}
				</Match>
				<Match when={state() == "loading"}>Connecting to QUIC server</Match>
				<Match when={state() == "handshake"}>Connecting to MoQ server</Match>
				<Match when={state() == "connected"}>Connected to server</Match>
				<Match when={state() == "closed"}>Connection closed</Match>
			</Switch>
		</div>
	)
}

function Settings(props: { player: Player; broadcaster: Broadcaster }) {
	const [show, setShow] = createSignal(true)
	const toggle = () => setShow((x) => !x)

	return (
		<>
			<Show when={show()}>
				<div class="absolute top-0 w-full p-10">
					<div class="flex flex-row rounded-md bg-white/90 shadow-xl ring-1 ring-gray-900/5 backdrop-blur-md">
						<div class="w-60 basis-1/2 p-6">
							<Playback.Settings player={props.player} />
						</div>
						<div class="basis-0 border-l-2 border-dotted border-black/20"></div>
						<div class="w-60 basis-1/2 p-6">
							<Broadcast.Settings broadcaster={props.broadcaster} />
						</div>
					</div>
				</div>
			</Show>

			<div
				class="absolute right-0 top-0 p-3 transition-all hover:rotate-45 hover:cursor-pointer"
				onClick={toggle}
			>
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-6 w-6 fill-white/90">
					<path d="M24 13.616v-3.232c-1.651-.587-2.694-.752-3.219-2.019v-.001c-.527-1.271.1-2.134.847-3.707l-2.285-2.285c-1.561.742-2.433 1.375-3.707.847h-.001c-1.269-.526-1.435-1.576-2.019-3.219h-3.232c-.582 1.635-.749 2.692-2.019 3.219h-.001c-1.271.528-2.132-.098-3.707-.847l-2.285 2.285c.745 1.568 1.375 2.434.847 3.707-.527 1.271-1.584 1.438-3.219 2.02v3.232c1.632.58 2.692.749 3.219 2.019.53 1.282-.114 2.166-.847 3.707l2.285 2.286c1.562-.743 2.434-1.375 3.707-.847h.001c1.27.526 1.436 1.579 2.019 3.219h3.232c.582-1.636.75-2.69 2.027-3.222h.001c1.262-.524 2.12.101 3.698.851l2.285-2.286c-.744-1.563-1.375-2.433-.848-3.706.527-1.271 1.588-1.44 3.221-2.021zm-12 2.384c-2.209 0-4-1.791-4-4s1.791-4 4-4 4 1.791 4 4-1.791 4-4 4z" />
				</svg>
			</div>
		</>
	)
}
