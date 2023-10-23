/* eslint-disable jsx-a11y/media-has-caption */
import { Player } from "@kixelated/moq/playback"
import { Client, Connection } from "@kixelated/moq/transport"

import Fail from "./fail"

import { Match, Switch, createEffect, createSelector, createSignal, onCleanup } from "solid-js"

export default function Watch(props: { name: string }) {
	// Use query params to allow overriding environment variables.
	const urlSearchParams = new URLSearchParams(window.location.search)
	const params = Object.fromEntries(urlSearchParams.entries())
	const server = params.server ?? import.meta.env.PUBLIC_RELAY_HOST

	const [mode, setMode] = createSignal<"mse" | "webcodecs">("mse")
	const [error, setError] = createSignal<Error | undefined>()

	// Render the canvas when the DOM is inserted
	let canvas: HTMLCanvasElement | undefined
	let video: HTMLVideoElement | undefined

	const [connection, setConnection] = createSignal<Connection | undefined>()
	createEffect(() => {
		setConnection(undefined)

		const url = `https://${server}/${props.name}`

		// Special case localhost to fetch the TLS fingerprint from the server.
		// TODO remove this when WebTransport correctly supports self-signed certificates
		const fingerprint = server.startsWith("localhost") ? `https://${server}/fingerprint` : undefined

		const client = new Client({
			url,
			fingerprint,
			role: "subscriber",
		})

		client.connect().then(setConnection).catch(setError)
	})

	createEffect(() => {
		const conn = connection()
		if (!conn) return

		onCleanup(() => conn.close())
		conn.closed()
			.then(setError)
			.catch(setError)
			.finally(() => setConnection(undefined))
	})

	const [_player, setPlayer] = createSignal<Player | undefined>()

	createEffect(() => {
		setPlayer(undefined)

		const conn = connection()
		if (!conn) return

		const element = canvas ?? video
		if (!element) throw new Error("no render element")

		const player = new Player({ connection: conn, element })
		setPlayer(player)

		if (element instanceof HTMLVideoElement) {
			element.addEventListener("play", () => player.play())
		}

		onCleanup(() => player.close())

		player
			.closed()
			.then(setError)
			.catch(setError)
			.finally(() => setPlayer(undefined))
	})

	const isMode = createSelector(mode)

	// NOTE: The canvas automatically has width/height set to the decoded video size.
	// TODO shrink it if needed via CSS
	return (
		<>
			<Fail error={error()} />
			<Switch>
				<Match when={mode() == "mse"}>
					<video class="aspect-video w-full rounded-lg bg-black" autoplay controls ref={video} />
				</Match>
				<Match when={mode() == "webcodecs"}>
					<canvas class="aspect-video w-full rounded-lg bg-black" ref={canvas} />
				</Match>
			</Switch>

			<h3>Advanced</h3>
			<button
				classList={{
					"bg-green-500": isMode("mse"),
					"hover:bg-green-600": isMode("mse"),
					"text-white": isMode("mse"),
				}}
				onClick={(e) => {
					setMode("mse")
					e.preventDefault()
				}}
				class="rounded-r-none border-r-2 border-r-slate-900"
			>
				Media Source <span class="block text-xs text-gray-300">(higher latency)</span>
			</button>
			<button
				classList={{
					"bg-green-500": isMode("webcodecs"),
					"hover:bg-green-600": isMode("webcodecs"),
					"text-white": isMode("webcodecs"),
				}}
				onClick={(e) => {
					setMode("webcodecs")
					e.preventDefault()
				}}
				class="rounded-l-none"
			>
				WebCodecs <span class="block text-xs text-gray-300">(experimental)</span>
			</button>
		</>
	)
}
