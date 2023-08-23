import { Client, Connection } from "@kixelated/moq/transport"
import { Player, Broadcast, Broadcasts } from "@kixelated/moq/playback"
import { asError } from "@kixelated/moq/common"

import { For, createSignal, createEffect, createResource, Show } from "solid-js"
import { Listing } from "../common/catalog"

export function Announced(props: { setPlayer(v: Player): void; setError(e: Error | undefined): void }) {
	const [connection, setConnection] = createSignal<Connection | undefined>()

	return (
		<>
			<p class="p-6">
				Watch a <b class="text-green-500">PUBLIC</b> broadcast. Report any abuse pls.
			</p>

			<header class="my-3 border-b-2 border-green-600 pl-3 text-xl">Broadcasts</header>
			<Show
				when={connection()}
				fallback={<Connect setConnection={setConnection} setError={(e) => props.setError(e)} />}
			>
				<Select
					connection={connection()}
					setPlayer={(v) => props.setPlayer(v)}
					setError={(e) => props.setError(e)}
				/>
			</Show>
		</>
	)
}

function Connect(props: { setConnection(v: Connection | undefined): void; setError(e?: Error): void }) {
	const params = new URLSearchParams(window.location.search)

	const [server, setServer] = createSignal<string>(
		params.get("server") ?? process.env.NODE_ENV === "production" ? "moq-demo.englishm.net:4443" : "localhost:4443",
	)

	const [local, setLocal] = createSignal<boolean>(
		params.get("local") === "true" || process.env.NODE_ENV !== "production",
	)

	const [loading, setLoading] = createSignal(true) // Automatically fetch with the defaults

	// Starting establishing the connection when the load button is clicked.
	const [connection] = createResource(loading, async () => {
		const url = "https://" + server()

		// Start connecting while we wait for the media to be ready.
		const client = new Client({
			url: url,
			role: "both",
			fingerprint: local() ? url + "/fingerprint" : undefined,
		})

		return await client.connect()
	})

	// Run the connection and return it upstream.
	createEffect(async () => {
		try {
			const conn = connection()
			if (!conn) return

			props.setConnection(conn)
			await conn.run()
		} catch (e) {
			props.setError(asError(e))
		} finally {
			setLoading(false)
			props.setConnection(undefined)
		}
	})

	const submit = (e: Event) => {
		e.preventDefault()

		// Clear the error when we try to connect again.
		props.setError(undefined)
		setLoading(true)
	}

	return (
		<form class="grid items-center gap-x-6 gap-y-3 text-sm">
			<label for="url" class="col-start-1 p-2">
				Server
			</label>
			<div class="flex items-center gap-3">
				<input
					name="server"
					class="flex-grow rounded-md border-0 bg-slate-700 text-sm shadow-sm focus:ring-1 focus:ring-inset focus:ring-green-600"
					value={server()}
					onInput={(e) => setServer(e.target.value)}
				/>
				<label for="local">Self-Signed?</label>
				<input name="local" type="checkbox" checked={local()} onInput={(e) => setLocal(e.target.checked)} />
			</div>
			<div class="col-start-2 flex">
				<button
					class="basis-1/2 rounded-md bg-green-600 p-2 font-semibold shadow-sm hover:bg-green-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
					type="submit"
					onClick={submit}
				>
					<Show when={loading()} fallback="Load">
						Loading
					</Show>
				</button>
			</div>
		</form>
	)
}

function Select(props: { connection?: Connection; setPlayer(v: Player): void; setError(e: Error): void }) {
	const [broadcast, setBroadcast] = createSignal<Broadcast | undefined>()
	const [broadcasts, setBroadcasts] = createSignal<Broadcast[]>([])

	createEffect(async () => {
		try {
			if (!props.connection) return

			const announced = new Broadcasts(props.connection)
			for (;;) {
				const broadcast = await announced.next()

				// Append to the start so newest entries are first.
				setBroadcasts((prev) => [broadcast, ...prev])
			}
		} catch (e) {
			props.setError(asError(e))
		} finally {
			setBroadcasts([])
		}
	})

	createEffect(() => {
		const connection = props.connection
		const selected = broadcast()
		if (!connection || !selected) return

		const player = new Player(connection, selected)
		props.setPlayer(player)
	})

	return (
		<>
			<ul class="px-6">
				<Show when={props.connection} fallback={"Disconnected"}>
					<For
						each={broadcasts()}
						fallback={
							<li>
								No live broadcasts. Somebody should <a href="publish">PUBLISH</a>.
							</li>
						}
					>
						{(broadcast) => {
							const select = (e: MouseEvent) => {
								e.preventDefault()
								setBroadcast(broadcast)
							}

							return (
								<li class="mt-4">
									<Listing
										click={select}
										name={broadcast.name}
										catalog={broadcast.catalog}
										connection={broadcast.connection}
									/>
								</li>
							)
						}}
					</For>
				</Show>
			</ul>
		</>
	)
}
