import { Player } from "@kixelated/moq/playback"
import { Client, Connection } from "@kixelated/moq/transport"

import Fail from "./fail"

import { createEffect, createSignal, onCleanup } from "solid-js"

export default function Watch(props: { name: string; server?: string }) {
	const [error, setError] = createSignal<Error | undefined>()

	// Render the canvas when the DOM is inserted
	let canvas: HTMLCanvasElement | undefined

	const [connection, setConnection] = createSignal<Connection | undefined>()
	createEffect(() => {
		setConnection(undefined)

		const server = props.server ?? import.meta.env.PUBLIC_RELAY_HOST
		const url = `https://${server}/${props.name}`

		// Special case localhost to fetch the TLS fingerprint from the server.
		// TODO remove this when WebTransport correctly supports self-signed certificates
		const fingerprint = server.startsWith("localhost")
			? `https://${server}/fingerprint`
			: undefined

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
		if (!canvas) return
		if (!conn) return

		const player = new Player({ connection: conn, canvas })
		setPlayer(player)

		onCleanup(() => player.close())

		player
			.closed()
			.then(setError)
			.catch(setError)
			.finally(() => setPlayer(undefined))
	})

	// NOTE: The canvas automatically has width/height set to the decoded video size.
	// TODO shrink it if needed via CSS
	return (
		<>
			<Fail error={error()} />
			<canvas class="aspect-video w-full rounded-md bg-black" ref={canvas} />
		</>
	)
}
