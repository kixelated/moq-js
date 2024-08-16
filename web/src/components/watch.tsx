/* eslint-disable jsx-a11y/media-has-caption */
import { Player } from "@kixelated/moq/playback"

import Fail from "./fail"

import { createEffect, createMemo, createSignal, onCleanup, Show } from "solid-js"

export default function Watch(props: { name: string }) {
	// Use query params to allow overriding environment variables.
	const urlSearchParams = new URLSearchParams(window.location.search)
	const params = Object.fromEntries(urlSearchParams.entries())
	const server = params.server ?? import.meta.env.PUBLIC_RELAY_HOST

	const [error, setError] = createSignal<Error | undefined>()

	let canvas!: HTMLCanvasElement

	const [usePlayer, setPlayer] = createSignal<Player | undefined>()
	const [showCatalog, setShowCatalog] = createSignal(false)

	createEffect(() => {
		const namespace = props.name
		const url = `https://${server}`

		// Special case localhost to fetch the TLS fingerprint from the server.
		// TODO remove this when WebTransport correctly supports self-signed certificates
		const fingerprint = server.startsWith("localhost") ? `https://${server}/fingerprint` : undefined

		Player.create({ url, fingerprint, canvas, namespace }).then(setPlayer).catch(setError)
	})

	createEffect(() => {
		const player = usePlayer()
		if (!player) return

		onCleanup(() => player.close())
		player.closed().then(setError).catch(setError)
	})

	const play = () => {
		usePlayer()?.play().catch(setError)
	}

	// The JSON catalog for debugging.
	const catalog = createMemo(() => {
		const player = usePlayer()
		if (!player) return

		const catalog = player.getCatalog()
		return JSON.stringify(catalog, null, 2)
	})

	// NOTE: The canvas automatically has width/height set to the decoded video size.
	// TODO shrink it if needed via CSS
	return (
		<>
			<Fail error={error()} />
			<canvas ref={canvas} onClick={play} class="aspect-video w-full rounded-lg" />

			<h3>Debug</h3>
			<Show when={catalog()}>
				<div class="mt-2 flex">
					<button onClick={() => setShowCatalog((prev) => !prev)}>
						{showCatalog() ? "Hide Catalog" : "Show Catalog"}
					</button>
				</div>
				<Show when={showCatalog()}>
					<pre>{catalog()}</pre>
				</Show>
			</Show>
		</>
	)
}
