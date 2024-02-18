import { Reader, Writer } from "./stream"
export { Reader, Writer }

export enum StreamType {
	Object = 0x0,
	Group = 0x50,
	Track = 0x51,
}

export interface TrackHeader {
	type: StreamType.Track
	sub: bigint
	track: bigint
	priority: number // VarInt with a u32 maximum value
}

export interface TrackChunk {
	group: number // The group sequence, as a number because 2^53 is enough.
	object: number
	payload: Uint8Array
}

export interface GroupHeader {
	type: StreamType.Group
	sub: bigint
	track: bigint
	group: number // The group sequence, as a number because 2^53 is enough.
	priority: number // VarInt with a u32 maximum value
}

export interface GroupChunk {
	object: number
	payload: Uint8Array
}

export interface ObjectHeader {
	type: StreamType.Object
	sub: bigint
	track: bigint
	group: number
	object: number
	priority: number
}

export interface ObjectChunk {
	payload: Uint8Array
}

type WriterType<T> = T extends TrackHeader
	? TrackWriter
	: T extends GroupHeader
	? GroupWriter
	: T extends ObjectHeader
	? ObjectWriter
	: never

export class Objects {
	private quic: WebTransport

	constructor(quic: WebTransport) {
		this.quic = quic
	}

	async send<T extends TrackHeader | GroupHeader | ObjectHeader>(header: T): Promise<WriterType<T>> {
		const stream = await this.quic.createUnidirectionalStream()

		if (header.type == StreamType.Object) {
			return new ObjectWriter(stream) as WriterType<T>
		} else if (header.type === StreamType.Group) {
			return new GroupWriter(stream) as WriterType<T>
		} else if (header.type === StreamType.Track) {
			return new TrackWriter(stream) as WriterType<T>
		} else {
			throw new Error("unknown header type")
		}
	}

	async recv(): Promise<TrackReader | GroupReader | ObjectReader | undefined> {
		const streams = this.quic.incomingUnidirectionalStreams.getReader()

		const { value, done } = await streams.read()
		streams.releaseLock()

		if (done) return

		const r = new Reader(value)
		const typ = (await r.u53()) as StreamType
		if (typ == StreamType.Track) {
			return new TrackReader(r.stream)
		} else if (typ == StreamType.Group) {
			return new GroupReader(r.stream)
		} else if (typ == StreamType.Object) {
			return new ObjectReader(r.stream)
		} else {
			throw new Error("unknown stream type")
		}
	}
}

export class TrackWriter {
	stream: WritableStream<Uint8Array>

	constructor(stream: WritableStream<Uint8Array>) {
		this.stream = stream
	}

	async header(h: TrackHeader) {
		const w = new Writer(this.stream)
		await w.u53(h.type)
		await w.u62(h.sub)
		await w.u62(h.track)
		await w.u53(h.priority)
	}

	async chunk(c: TrackChunk) {
		const w = new Writer(this.stream)
		await w.u53(c.group)
		await w.u53(c.object)
		await w.u53(c.payload.byteLength)
		await w.write(c.payload)
	}

	async close() {
		await this.stream.close()
	}
}

export class GroupWriter {
	stream: WritableStream<Uint8Array>

	constructor(stream: WritableStream<Uint8Array>) {
		this.stream = stream
	}

	async header(h: GroupHeader) {
		const w = new Writer(this.stream)
		await w.u53(h.type)
		await w.u62(h.sub)
		await w.u62(h.track)
		await w.u53(h.group)
		await w.u53(h.priority)
	}

	async chunk(c: GroupChunk) {
		const w = new Writer(this.stream)
		await w.u53(c.object)
		await w.u53(c.payload.byteLength)
		await w.write(c.payload)
	}

	async close() {
		await this.stream.close()
	}
}

export class ObjectWriter {
	stream: WritableStream<Uint8Array>

	constructor(stream: WritableStream<Uint8Array>) {
		this.stream = stream
	}

	async header(h: ObjectHeader) {
		const w = new Writer(this.stream)
		await w.u53(h.type)
		await w.u62(h.sub)
		await w.u62(h.track)
		await w.u53(h.group)
		await w.u53(h.object)
		await w.u53(h.priority)
	}

	async chunk(chunk: ObjectChunk) {
		const w = new Writer(this.stream)
		await w.write(chunk.payload)
	}

	async close() {
		await this.stream.close()
	}
}

export class TrackReader {
	stream: ReadableStream<Uint8Array>

	constructor(stream: ReadableStream<Uint8Array>) {
		this.stream = stream
	}

	async header(): Promise<TrackHeader> {
		const r = new Reader(this.stream)
		return {
			type: StreamType.Track,
			sub: await r.u62(),
			track: await r.u62(),
			priority: await r.u53(),
		}
	}

	async chunk(): Promise<TrackChunk> {
		const r = new Reader(this.stream)
		const group = await r.u53()
		const object = await r.u53()
		const size = await r.u53()
		const payload = await r.readExact(size)

		return {
			group,
			object,
			payload,
		}
	}

	async close() {
		await this.stream.cancel()
	}
}

export class GroupReader {
	stream: ReadableStream<Uint8Array>

	constructor(stream: ReadableStream<Uint8Array>) {
		this.stream = stream
	}

	async header(): Promise<GroupHeader> {
		const r = new Reader(this.stream)
		return {
			type: StreamType.Group,
			sub: await r.u62(),
			track: await r.u62(),
			group: await r.u53(),
			priority: await r.u53(),
		}
	}

	async chunk(): Promise<GroupChunk> {
		const r = new Reader(this.stream)
		const object = await r.u53()
		const size = await r.u53()
		const payload = await r.readExact(size)

		return {
			object,
			payload,
		}
	}

	async close() {
		await this.stream.cancel()
	}
}

export class ObjectReader {
	stream: ReadableStream<Uint8Array>

	constructor(stream: ReadableStream<Uint8Array>) {
		this.stream = stream
	}

	async header(): Promise<ObjectHeader> {
		const r = new Reader(this.stream)
		return {
			type: StreamType.Object,
			sub: await r.u62(),
			track: await r.u62(),
			group: await r.u53(),
			object: await r.u53(),
			priority: await r.u53(),
		}
	}

	async chunk(): Promise<ObjectChunk> {
		const r = new Reader(this.stream)
		return {
			payload: await r.readAll(),
		}
	}

	async close() {
		await this.stream.cancel()
	}
}
