/* eslint-disable jsx-a11y/media-has-caption */
import { Player } from "@kixelated/moq/playback"
import * as Catalog from "@kixelated/moq/karp/catalog"

import Fail from "./fail"

import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js"
import { Client, Connection } from "@kixelated/moq/transfork"

export default function Watch(props: { name: string }) {
	// Use query params to allow overriding environment variables.
	const urlSearchParams = new URLSearchParams(window.location.search)
	const params = Object.fromEntries(urlSearchParams.entries())
	const server = params.server ?? import.meta.env.PUBLIC_RELAY_HOST

	const [error, setError] = createSignal<Error | undefined>()

	let canvas!: HTMLCanvasElement

	const [useCatalog, setCatalog] = createSignal<Catalog.Broadcast | undefined>()
	const [useConnection, setConnection] = createSignal<Connection | undefined>()

	const [usePlayer, setPlayer] = createSignal<Player | undefined>()

	createEffect(() => {
		const url = `https://${server}`

		// Special case localhost to fetch the TLS fingerprint from the server.
		// TODO remove this when WebTransport correctly supports self-signed certificates
		const fingerprint = server.startsWith("localhost") ? `https://${server}/fingerprint` : undefined

		const client = new Client({ url, fingerprint })
		client
			.connect()
			.then(setConnection)
			.catch((err) => setError(new Error(`failed to connect to server: ${err}`)))
	})

	createEffect(() => {
		const connection = useConnection()
		if (!connection) return

		Catalog.fetch(connection, props.name)
			.then(setCatalog)
			.catch((err) => setError(new Error(`failed to fetch catalog: ${err}`)))
	})

	createEffect(() => {
		const connection = useConnection()
		const catalog = useCatalog()
		if (!connection || !catalog) return setPlayer(undefined)

		setPlayer(new Player({ connection, catalog, canvas }))
	})

	createEffect(() => {
		const player = usePlayer()
		if (!player) return

		onCleanup(() => player.close())
		player.closed().catch((err) => setError(new Error(`player closed: ${err}`)))
	})

	const play = () => {
		usePlayer()?.play().catch(setError)
	}

	// NOTE: The canvas automatically has width/height set to the decoded video size.
	// TODO shrink it if needed via CSS
	return (
		<>
			<Fail error={error()} />
			<canvas ref={canvas} onClick={play} class="aspect-video w-full rounded-lg" />
		</>
	)
}
