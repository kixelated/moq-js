import { Client, Connection } from "@kixelated/moq/transport"
import { createFetch } from "./common"
import { Accessor, createEffect, createMemo, onCleanup } from "solid-js"

export function connect(
	server: string | Accessor<string> | undefined,
	role: "subscriber" | "publisher" | "both",
): [Accessor<Connection | undefined>, Accessor<Error | undefined>] {
	const connection = createFetch((server: string) => {
		const url = `https://${server}`

		// Special case localhost to fetch the TLS fingerprint from the server.
		// TODO remove this when WebTransport correctly supports self-signed certificates
		const fingerprint = server.startsWith("localhost") ? url + "/fingerprint" : undefined

		const client = new Client({
			url,
			fingerprint,
			role: role,
		})

		return client.connect()
	}, server)

	createEffect(() => {
		// Close the connection when the component is unmounted.
		onCleanup(() => connection()?.close())
	})

	const closed = createFetch((connection: Connection) => connection.closed(), connection)
	const error = createMemo(() => connection.error() ?? closed())

	return [connection, error]
}
