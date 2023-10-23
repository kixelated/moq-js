/* eslint-disable jsx-a11y/media-has-caption */
import { Player } from "@kixelated/moq/playback"
import { Client, Connection } from "@kixelated/moq/transport"
import { Catalog } from "@kixelated/moq/media/catalog"

import Fail from "./fail"

import { Match, Switch, createEffect, createMemo, createSelector, createSignal, onCleanup } from "solid-js"

export default function Watch(props: { name: string }) {
	// Use query params to allow overriding environment variables.
	const urlSearchParams = new URLSearchParams(window.location.search)
	const params = Object.fromEntries(urlSearchParams.entries())
	const server = params.server ?? import.meta.env.PUBLIC_RELAY_HOST

	const defaultMode = "VideoDecoder" in window ? "webcodecs" : "mse"
	const [mode, setMode] = createSignal(defaultMode)
	const [error, setError] = createSignal<Error | undefined>()

	// Create a canvas element outside of Signal so it doesn't get torn down.
	const canvas = document.createElement("canvas")
	canvas.classList.add("w-full", "rounded-lg", "aspect-video")

	// Same thing for the video element.
	const video = document.createElement("video")
	video.classList.add("w-full", "rounded-lg", "aspect-video")
	video.muted = true // so we can autoplay
	video.autoplay = true
	video.controls = true

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

	const [catalog, setCatalog] = createSignal<Catalog | undefined>()
	createEffect(() => {
		const conn = connection()
		if (!conn) return

		Catalog.fetch(conn).then(setCatalog).catch(setError)
	})

	const player = createMemo(() => {
		const conn = connection()
		if (!conn) return

		const cata = catalog()
		if (!cata) return

		const element = isMode("mse") ? video : canvas

		const player = new Player({ connection: conn, element, catalog: cata })
		if (element instanceof HTMLVideoElement) {
			element.addEventListener("play", () => {
				player.play().catch(setError)
			})
		}

		return player
	})

	createEffect(() => {
		const p = player()
		if (!p) return

		onCleanup(() => p.close())
		p.closed().then(setError).catch(setError)
	})

	const isMode = createSelector(mode)

	// NOTE: The canvas automatically has width/height set to the decoded video size.
	// TODO shrink it if needed via CSS
	return (
		<>
			<Fail error={error()} />
			<Switch>
				<Match when={mode() == "mse"}>{video}</Match>
				<Match when={mode() == "webcodecs"}>{canvas}</Match>
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
				Media Source <span class="block text-xs text-gray-200">(higher latency)</span>
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
				WebCodecs <span class="block text-xs text-gray-200">(experimental)</span>
			</button>
		</>
	)
}
