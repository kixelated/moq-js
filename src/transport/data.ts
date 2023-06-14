import { Reader, Writer } from "../stream"

// This is OBJECT but we can't use that name because it's a reserved word.
export interface Header {
	track: number
	group: number
	sequence: number
	send_order: number
	// followed by payload
}

export interface Payload {
	buffer: Uint8Array // unread buffered data
	reader: ReadableStream // unread unbuffered data
}

export class Transport {
	private quic: WebTransport

	constructor(quic: WebTransport) {
		this.quic = quic
	}

	async recv(): Promise<[Header, Reader] | undefined> {
		const streams = this.quic.incomingUnidirectionalStreams.getReader()

		const result = await streams.read()
		streams.releaseLock()

		if (result.done) return

		const reader = new Reader(result.value)
		const header = await decode_header(reader)

		return [header, reader]
	}

	async send(header: Header): Promise<Writer> {
		const stream = await this.quic.createUnidirectionalStream()

		// TODO use send_order when suppotred
		const writer = new Writer(stream)
		await encode_header(writer, header)

		return writer
	}
}

async function decode_header(r: Reader): Promise<Header> {
	const track = await r.vint52()
	const group = await r.vint52()
	const sequence = await r.vint52()
	const send_order = await r.vint52()

	return {
		track,
		group,
		sequence,
		send_order,
	}
}

async function encode_header(w: Writer, h: Header) {
	await w.vint52(h.track)
	await w.vint52(h.group)
	await w.vint52(h.sequence)
	await w.vint52(h.send_order)
}
