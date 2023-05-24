import * as Stream from "../stream"
import * as Interface from "./interface"

export interface Config {
	url: string

	// If set, the server fingerprint will be fetched from this URL.
	// This is required to use self-signed certificates with Chrome (May 2023)
	fingerprintUrl?: string
}

export default class Transport {
	quic: Promise<WebTransport>
	api: Promise<WritableStream>
	callback?: Interface.Callback

	constructor(config: Config) {
		this.quic = this.connect(config)

		// Create a unidirectional stream for all of our messages
		this.api = this.quic.then((q) => {
			return q.createUnidirectionalStream()
		})

		// async functions
		this.receiveStreams()
	}

	async close() {
		;(await this.quic).close()
	}

	private async fingerprint(url: string): Promise<WebTransportHash> {
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
	private async connect(config: Config): Promise<WebTransport> {
		const options: WebTransportOptions = {}

		if (config.fingerprintUrl) {
			try {
				const fingerprint = await this.fingerprint(config.fingerprintUrl)
				options.serverCertificateHashes = [fingerprint]
			} catch (e) {
				console.warn("failed to fetch fingerprint: ", e)
			}
		}

		const quic = new WebTransport(config.url, options)
		await quic.ready
		return quic
	}

	async sendMessage(msg: any) {
		const payload = JSON.stringify(msg)
		const size = payload.length + 8

		const stream = await this.api

		const writer = new Stream.Writer(stream)
		await writer.uint32(size)
		await writer.string("warp")
		await writer.string(payload)
		writer.release()
	}

	async receiveStreams() {
		const q = await this.quic
		const streams = q.incomingUnidirectionalStreams.getReader()

		for (;;) {
			const result = await streams.read()
			if (result.done) break

			const stream = result.value
			this.handleStream(stream) // don't await
		}
	}

	async handleStream(stream: ReadableStream) {
		const r = new Stream.Reader(stream)

		while (!(await r.done())) {
			const size = await r.uint32()
			const typ = new TextDecoder("utf-8").decode(await r.bytes(4))

			if (typ != "warp") throw "expected warp atom"
			if (size < 8) throw "atom too small"

			const payload = new TextDecoder("utf-8").decode(await r.bytes(size - 8))
			const msg = JSON.parse(payload)

			if (msg.init) {
				return this.callback?.onInit({
					buffer: r.buffer,
					reader: r.reader,
				})
			} else if (msg.segment) {
				return this.callback?.onSegment({
					buffer: r.buffer,
					reader: r.reader,
				})
			} else {
				console.warn("unknown message", msg)
			}
		}
	}
}
