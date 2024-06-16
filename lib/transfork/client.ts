import { Stream } from "./stream"
import * as Message from "./message"
import { Connection } from "./connection"

export interface ClientConfig {
	url: string

	// Parameters used to create the MoQ session
	role: Message.Role

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

	async connect(): Promise<Connection> {
		// Helper function to make creating a promise easier
		const options: WebTransportOptions = {}

		const fingerprint = await this.#fingerprint
		if (fingerprint) options.serverCertificateHashes = [fingerprint]

		const quic = new WebTransport(this.config.url, options)
		await quic.ready

		const stream = await quic.createBidirectionalStream()
		const session = new Stream(stream)

		const client = new Message.SessionClient([Message.Version.FORK_00], this.config.role)
		await client.encode(session.writer)

		const server = await Message.SessionServer.decode(session.reader)
		if (server.version != Message.Version.FORK_00) {
			throw new Error(`unsupported server version: ${server.version}`)
		}

		// TODO use the returned server.role

		return new Connection(quic, client.role, session)
	}

	async #fetchFingerprint(url?: string): Promise<WebTransportHash | undefined> {
		if (!url) return

		// TODO remove this fingerprint when Chrome WebTransport accepts the system CA
		const response = await fetch(url)
		const hexString = await response.text()

		const hexBytes = new Uint8Array(hexString.length / 2)
		for (let i = 0; i < hexBytes.length; i += 1) {
			hexBytes[i] = parseInt(hexString.slice(2 * i, 2 * i + 2), 16)
		}

		return {
			algorithm: "sha-256",
			value: hexBytes,
		}
	}
}
