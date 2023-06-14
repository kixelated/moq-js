import * as Stream from "../stream"
import * as Setup from "./setup"
import * as Control from "./control"
import * as Data from "./data"

export interface Config {
	url: string

	// Parameters used to create the MoQ session
	setup: Setup.Client

	// If set, the server fingerprint will be fetched from this URL.
	// This is required to use self-signed certificates with Chrome (May 2023)
	fingerprintUrl?: string
}

export class Connection {
	quic: Promise<WebTransport>

	// Use to receive/send control messages.
	control: Promise<Control.Stream>

	// Use to receive/send data streams.
	data: Promise<Data.Transport>

	constructor(config: Config) {
		this.quic = this.#connect(config)

		// Create a bidirection stream to control the connection
		this.control = this.#setup(config.setup)

		// Create unidirectional streams to send media.
		this.data = this.quic.then((quic) => {
			return new Data.Transport(quic)
		})
	}

	async close() {
		;(await this.quic).close()
	}

	async #fingerprint(url: string): Promise<WebTransportHash> {
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

	// Helper function to make creating a promise easier
	async #connect(config: Config): Promise<WebTransport> {
		const options: WebTransportOptions = {}

		if (config.fingerprintUrl) {
			try {
				const fingerprint = await this.#fingerprint(config.fingerprintUrl)
				options.serverCertificateHashes = [fingerprint]
			} catch (e) {
				console.warn("failed to fetch fingerprint: ", e)
			}
		}

		const quic = new WebTransport(config.url, options)
		await quic.ready

		return quic
	}

	async #setup(client: Setup.Client): Promise<Control.Stream> {
		const quic = await this.quic
		const stream = await quic.createBidirectionalStream()

		const writer = new Stream.Writer(stream.writable)
		const reader = new Stream.Reader(stream.readable)

		const setup = new Setup.Stream(reader, writer)

		// Send the setup message.
		await setup.send.client(client)

		// Receive the setup message.
		// TODO verify the SETUP response.
		const _server = await setup.recv.server()

		return new Control.Stream(reader, writer)
	}
}
