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

	async runAnnounce(msg: Message.Announce, stream: Stream) {
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
	async subscribe(track: Track): Promise<TrackReader> {
		const id = this.#subscribeNext++
		const msg = new Message.Subscribe(id, track.broadcast, track.name, track.priority)

		const stream = await Stream.open(this.#quic, msg)
		const subscribe = new Subscribe(id, stream, track)

		this.#subscribe.set(subscribe.id, subscribe)

		try {
			const _ok = await Message.Info.decode(stream.reader)
		} catch (err) {
			this.#subscribe.delete(subscribe.id)
			await subscribe.close(Closed.from(err))
			throw err
		}

		subscribe
			.run()
			.catch((err) => console.warn("subscribe closed", err))
			.finally(() => this.#subscribe.delete(subscribe.id))

		return track.reader()
	}

	async runGroup(msg: Message.Group, stream: Reader) {
		const subscribe = this.#subscribe.get(msg.subscribe)
		if (!subscribe) return

		const group = subscribe.track.createGroup(msg.sequence)

		const reader = new FrameReader(stream)
		for (;;) {
			const frame = await reader.read()
			console.debug("received frame", frame)

			if (!frame) break
			group.writeFrame(frame)
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
	readonly stream: Stream

	// A queue of received streams for this subscription.
	#closed = new Watch<Closed | undefined>(undefined)

	constructor(id: bigint, stream: Stream, track: Track) {
		this.id = id
		this.track = track
		this.stream = stream
	}

	async run() {
		try {
			await this.closed()
			await this.close()
		} catch (err) {
			await this.close(Closed.from(err))
		}
	}

	async close(closed?: Closed) {
		this.track.close(closed)
		await this.stream.close(closed?.code)
	}

	async closed() {
		await this.stream.reader.closed()
	}
}
