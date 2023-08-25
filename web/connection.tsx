import { Accessor, Show, createContext, createSignal, useContext } from "solid-js"
import { Client, Connection } from "@kixelated/moq/transport"

const context = createContext<Accessor<Connection | undefined>>()

export function Connect(props: { children: any }) {
	const [connection, setConnection] = createSignal<Connection | undefined>()
	const [error, setError] = createSignal<Error | undefined>()

	;(async () => {
		const client = new Client({
			url: process.env.RELAY_HOST,
			fingerprint: process.env.RELAY_CERT,
			role: "both",
		})

		const connection = await client.connect()
		setConnection(connection)

		throw await connection.closed()
	})().catch(setError)

	return (
		<context.Provider value={connection}>
			<Show when={error()}>
				<div class="rounded-md bg-red-600 px-4 py-2 font-bold">
					{error()!.name}: {error()!.message}
				</div>
			</Show>
			<Show when={connection}>{props.children}</Show>
		</context.Provider>
	)
}

export function useConnection(): Accessor<Connection | undefined> {
	const ctx = useContext(context)
	if (!ctx) throw new Error("no connection context")
	return ctx
}
