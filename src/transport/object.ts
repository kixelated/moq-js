import { Reader, Writer } from "./stream"
export { Reader, Writer }

// This is OBJECT but we can't use that name because it's a reserved word.

// NOTE: This is forked from moq-transport-00.
//   1. messages lack a specified length
//   2. OBJECT must be the only message on a unidirectional stream

export interface Header {
	track: bigint
	group: bigint
	sequence: bigint
	send_order: bigint
	// followed by payload
}

export class Objects {
	private quic: WebTransport

	constructor(quic: WebTransport) {
		this.quic = quic
	}

	async send(header: Header) {
		const stream: WritableStream<Uint8Array> =
			(await this.quic.createUnidirectionalStream()) as WritableStream<Uint8Array>
		await this.#encode(stream, header)
		return stream
	}

	async recv() {
		// TODO not sure why the WebTransport API isn't typed correctly
		const streams = this.quic.incomingUnidirectionalStreams.getReader() as ReadableStreamDefaultReader<
			ReadableStream<Uint8Array>
		>

		const { value, done } = await streams.read()
		streams.releaseLock()

		if (done) return
		const stream = value

		const header = await this.#decode(stream)
		return { header, stream }
	}

	async #decode(s: ReadableStream<Uint8Array>) {
		const r = new Reader(s)

		const type = await r.vint52()
		if (type !== 0) throw new Error(`OBJECT type must be 0, got ${type}`)

		const track = await r.vint62()
		const group = await r.vint62()
		const sequence = await r.vint62()
		const send_order = await r.vint62()

		return {
			track,
			group,
			sequence,
			send_order,
		}
	}

	async #encode(s: WritableStream<Uint8Array>, h: Header) {
		const w = new Writer(s)
		await w.vint52(0)
		await w.vint62(h.track)
		await w.vint62(h.group)
		await w.vint62(h.sequence)
		await w.vint62(h.send_order)
	}
}
