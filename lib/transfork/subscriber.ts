import { Queue, Watch } from "../common/async"
import { Closed } from "./error"
import * as Message from "./message"
import { FrameReader } from "./frame"
import { Stream, Reader } from "./stream"
import { Track, TrackReader } from "./model"

export class Subscriber {
	#quic: WebTransport

	// Announced broadcasts.
	#announced = new Queue<Announced>()

	// Our subscribed tracks.
	#subscribe = new Map<bigint, Subscribe>()
	#subscribeNext = 0n

	constructor(quic: WebTransport) {
		this.#quic = quic
	}

	async announced(): Promise<Announced | undefined> {
		return this.#announced.next()
	}

	async runAnnounce(stream: Stream) {
		const msg = await Message.Announce.decode(stream.reader)

		const announce = new Announced(msg)
		await this.#announced.push(announce)

		try {
			await Promise.any([stream.reader.closed(), announce.closed()])
			announce.close()
		} catch (err) {
			announce.close(Closed.from(err))
		}
	}

	// TODO: Deduplicate identical subscribes
	subscribe(track: Track): TrackReader {
		const id = this.#subscribeNext++

		const subscribe = new Subscribe(id, track)
		this.runSubscribe(subscribe).catch(console.error)

		return track.reader()
	}

	async runSubscribe(subscribe: Subscribe) {
		this.#subscribe.set(subscribe.id, subscribe)

		try {
			const stream = new Stream(await this.#quic.createBidirectionalStream())

			const track = subscribe.track
			const msg = new Message.Subscribe(subscribe.id, track.broadcast, track.name, track.priority)

			await stream.writer.u8(Message.StreamBi.Subscribe)
			await msg.encode(stream.writer)

			await stream.reader.closed()
			subscribe.close()
		} catch (err) {
			subscribe.close(Closed.from(err))
		} finally {
			this.#subscribe.delete(subscribe.id)
		}
	}

	async runGroup(stream: Reader) {
		const msg = await Message.Group.decode(stream)

		const subscribe = this.#subscribe.get(msg.subscribe)
		if (!subscribe) return

		const group = subscribe.track.create(msg.sequence)

		const reader = new FrameReader(stream)
		for (;;) {
			const frame = await reader.read()

			if (!frame) break
			group.write(frame)
		}

		group.close()
	}
}

export class Announced {
	readonly broadcast: string

	#closed = new Watch<Closed | undefined>(undefined)

	constructor(msg: Message.Announce) {
		this.broadcast = msg.broadcast
	}

	close(err = new Closed()) {
		this.#closed.update(err)
	}

	async closed(): Promise<Closed> {
		let [closed, next] = this.#closed.value()
		for (;;) {
			if (closed !== undefined) return closed
			if (!next) return new Closed()
			;[closed, next] = await next
		}
	}
}

export class Subscribe {
	readonly id: bigint
	readonly track: Track

	// A queue of received streams for this subscription.
	#closed = new Watch<Closed | undefined>(undefined)

	constructor(id: bigint, track: Track) {
		this.id = id
		this.track = track
	}

	close(err = new Closed()) {
		this.#closed.update(err)
		this.track.close(err)
	}

	async closed(): Promise<Closed> {
		let [closed, next] = this.#closed.value()
		for (;;) {
			if (closed !== undefined) return closed
			if (!next) return new Closed()
			;[closed, next] = await next
		}
	}
}
