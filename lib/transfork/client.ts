import { Stream } from "./stream"
import * as Message from "./message"
import { Connection } from "./connection"
import * as Hex from "../common/hex"

export interface ClientConfig {
	url: string

	// If set, the server fingerprint will be fetched from this URL.
	// This is required to use self-signed certificates with Chrome (May 2023)
	fingerprint?: string
}

export class Client {
	#fingerprint: Promise<WebTransportHash | undefined>

	readonly config: ClientConfig

	constructor(config: ClientConfig) {
		this.config = config

		this.#fingerprint = this.#fetchFingerprint(config.fingerprint).catch((e) => {
			console.warn("failed to fetch fingerprint: ", e)
			return undefined
		})
	}

	async connect(role: Message.Role = "both"): Promise<Connection> {
		// Helper function to make creating a promise easier
		const options: WebTransportOptions = {}

		const fingerprint = await this.#fingerprint
		if (fingerprint) options.serverCertificateHashes = [fingerprint]

		const quic = new WebTransport(this.config.url, options)
		await quic.ready

		const client = new Message.SessionClient([Message.Version.FORK_00], role)
		console.log("sending client setup: ", client)
		const stream = await Stream.open(quic, client)

		console.log("waiting for server setup")

		const server = await Message.SessionServer.decode(stream.reader)
		console.log("received server setup: ", server)
		if (server.version != Message.Version.FORK_00) {
			throw new Error(`unsupported server version: ${server.version}`)
		}

		console.log(
			`established connection: version=${server.version} client_role=${client.role} server_role=${server.role}`,
		)

		// TODO use the returned server.role

		return new Connection(quic, client.role, stream)
	}

	async #fetchFingerprint(url?: string): Promise<WebTransportHash | undefined> {
		if (!url) return

		// TODO remove this fingerprint when Chrome WebTransport accepts the system CA
		const response = await fetch(url)
		const bytes = Hex.decode(await response.text())

		return {
			algorithm: "sha-256",
			value: bytes,
		}
	}
}
