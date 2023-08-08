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
	send_order: number // i32
	// followed by payload
}

export class Objects {
	private quic: WebTransport

	constructor(quic: WebTransport) {
		this.quic = quic
	}

	async send(header: Header): Promise<WritableStream<Uint8Array>> {
		const stream = await this.quic.createUnidirectionalStream()
		await this.#encode(stream, header)
		return stream
	}

	async recv(): Promise<{ stream: ReadableStream<Uint8Array>; header: Header } | undefined> {
		const streams = this.quic.incomingUnidirectionalStreams.getReader()

		const { value, done } = await streams.read()
		streams.releaseLock()

		if (done) return
		const stream = value

		const header = await this.#decode(stream)
		return { header, stream }
	}

	async #decode(s: ReadableStream<Uint8Array>) {
		const r = new Reader(s)

		const type = await r.u8()
		if (type !== 0) throw new Error(`OBJECT type must be 0, got ${type}`)

		const track = await r.u62()
		const group = await r.u62()
		const sequence = await r.u62()
		const send_order = await r.i32()

		return {
			track,
			group,
			sequence,
			send_order,
		}
	}

	async #encode(s: WritableStream<Uint8Array>, h: Header) {
		const w = new Writer(s)
		await w.u8(0)
		await w.u62(h.track)
		await w.u62(h.group)
		await w.u62(h.sequence)
		await w.i32(h.send_order)
	}
}
