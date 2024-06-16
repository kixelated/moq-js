/* eslint-disable jsx-a11y/media-has-caption */
import { Player } from "@kixelated/moq/playback"
import { Broadcast } from "@kixelated/moq/media/catalog"

import Fail from "./fail"

import { createEffect, createSignal, onCleanup, onMount } from "solid-js"
import { Client, Connection } from "@kixelated/moq/transfork"

export default function Watch(props: { name: string }) {
	// Use query params to allow overriding environment variables.
	const urlSearchParams = new URLSearchParams(window.location.search)
	const params = Object.fromEntries(urlSearchParams.entries())
	const server = params.server ?? import.meta.env.PUBLIC_RELAY_HOST

	const [error, setError] = createSignal<Error | undefined>()

	let canvas!: HTMLCanvasElement

	const [useCatalog, setCatalog] = createSignal<Broadcast | undefined>()
	const [useConnection, setConnection] = createSignal<Connection | undefined>()

	const [usePlayer, setPlayer] = createSignal<Player | undefined>()
	onMount(() => {
		const url = `https://${server}`

		// Special case localhost to fetch the TLS fingerprint from the server.
		// TODO remove this when WebTransport correctly supports self-signed certificates
		const fingerprint = server.startsWith("localhost") ? `https://${server}/fingerprint` : undefined

		const client = new Client({ url, fingerprint, role: "both" })
		client.connect().then(setConnection).catch(setError)
	})

	createEffect(() => {
		const connection = useConnection()
		if (!connection) return

		const catalog = new Broadcast(props.name)
		catalog.fetch(connection).then(setCatalog).catch(setError)
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
		player.closed().then(setError).catch(setError)
	})

	const play = () => usePlayer()?.play()

	// NOTE: The canvas automatically has width/height set to the decoded video size.
	// TODO shrink it if needed via CSS
	return (
		<>
			<Fail error={error()} />
			<canvas ref={canvas} onClick={play} class="aspect-video w-full rounded-lg" />
		</>
	)
}
