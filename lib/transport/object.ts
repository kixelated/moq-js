import { Reader, Writer } from "./stream"
export { Reader, Writer }

// This is OBJECT but we can't use that name because it's a reserved word.

export interface Header {
	track: bigint
	group: number // The group sequence, as a number because 2^53 is enough.
	object: number // The object sequence within a group, as a number because 2^53 is enough.
	priority: number // VarInt with a u32 maximum value
	expires?: number // optional: expiration in seconds
	size?: number // optional: size of payload, otherwise it continues until end of stream
}

export class Objects {
	private quic: WebTransport

	constructor(quic: WebTransport) {
		this.quic = quic
	}

	async send(header: Header): Promise<WritableStream<Uint8Array>> {
		//console.debug("sending object: ", header)
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
		if (header.size) {
			throw new Error("TODO: handle OBJECT with size")
		}

		//console.debug("received object: ", header)
		return { header, stream }
	}

	async #decode(s: ReadableStream<Uint8Array>) {
		const r = new Reader(s)

		const type = await r.u8()
		if (type !== 0 && type !== 2) {
			throw new Error(`invalid OBJECT type, got ${type}`)
		}

		const has_size = type === 2

		return {
			track: await r.u62(),
			group: await r.u53(),
			object: await r.u53(),
			priority: await r.u53(),
			expires: (await r.u53()) || undefined,
			size: has_size ? await r.u53() : undefined,
		}
	}

	async #encode(s: WritableStream<Uint8Array>, h: Header) {
		const w = new Writer(s)
		await w.u8(h.size ? 2 : 0)
		await w.u62(h.track)
		await w.u53(h.group)
		await w.u53(h.object)
		await w.u53(h.priority)
		await w.u53(h.expires ?? 0)
		if (h.size) await w.u53(h.size)
	}
}
