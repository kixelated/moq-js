import * as Message from "./message"
import { Watch } from "../common/async"
import { Stream, Writer } from "./stream"
import { Closed } from "./error"
import { Broadcast, BroadcastReader, GroupReader, TrackReader } from "./model"

export class Publisher {
	#quic: WebTransport

	// Our announced broadcasts.
	#announce = new Map<string, Announce>()

	// Their subscribed tracks.
	#subscribe = new Map<bigint, Subscribed>()

	constructor(quic: WebTransport) {
		this.#quic = quic
	}

	// Announce a track broadcast.
	announce(broadcast: Broadcast): Announce {
		if (this.#announce.has(broadcast.name)) {
			throw new Error(`already announced: ${broadcast.name}`)
		}

		const announce = new Announce(broadcast.reader())
		this.#runAnnounce(announce).catch((err) => console.warn("failed to announce: ", err))

		return announce
	}

	async #runAnnounce(announce: Announce) {
		this.#announce.set(announce.broadcast.name, announce)

		try {
			const msg = new Message.Announce(announce.broadcast.name)
			const stream = await Stream.open(this.#quic, msg)

			await stream.reader.closed()
		} finally {
			this.#announce.delete(announce.broadcast.name)
		}
	}

	#get(msg: { broadcast: string; track: string }): TrackReader | undefined {
		return this.#announce.get(msg.broadcast)?.broadcast.get(msg.track)
	}

	async runSubscribe(msg: Message.Subscribe, stream: Stream) {
		if (this.#subscribe.has(msg.id)) {
			throw new Error(`duplicate subscribe for id: ${msg.id}`)
		}

		const track = this.#get(msg)
		if (!track) {
			await stream.writer.reset(404)
			return
		}

		const subscribe = new Subscribed(msg, track, this.#quic)

		// TODO close the stream when done
		subscribe.run().catch((err) => console.warn("failed to run subscribe: ", err))

		try {
			const info = new Message.Info(track.priority)
			info.order = track.order
			info.latest = track.latest
			await info.encode(stream.writer)

			for (;;) {
				// TODO try_decode
				const update = await Message.SubscribeUpdate.decode_maybe(stream.reader)
				if (!update) {
					subscribe.close()
					break
				}

				// TODO use the update
			}
		} catch (err) {
			subscribe.close(Closed.from(err))
		}
	}

	async runDatagrams(msg: Message.Datagrams, stream: Stream) {
		await stream.writer.reset(501)
		throw new Error("datagrams not implemented")
	}

	async runFetch(msg: Message.Fetch, stream: Stream) {
		await stream.writer.reset(501)
		throw new Error("fetch not implemented")
	}

	async runInfo(msg: Message.InfoRequest, stream: Stream) {
		const track = this.#get(msg)
		if (!track) {
			await stream.writer.reset(404)
			return
		}

		const info = new Message.Info(track.priority)
		info.order = track.order
		info.latest = track.latest

		await info.encode(stream.writer)

		throw new Error("info not implemented")
	}
}

export class Announce {
	readonly broadcast: BroadcastReader

	#closed = new Watch<Closed | undefined>(undefined)

	constructor(broadcast: BroadcastReader) {
		this.broadcast = broadcast
	}

	close(err = new Closed()) {
		this.#closed.update(err)
		this.broadcast.close()
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

class Subscribed {
	#id: bigint
	#track: TrackReader
	#quic: WebTransport

	#closed = new Watch<Closed | undefined>(undefined)

	constructor(msg: Message.Subscribe, track: TrackReader, quic: WebTransport) {
		this.#id = msg.id
		this.#track = track
		this.#quic = quic
	}

	async run() {
		const closed = this.closed()

		for (;;) {
			const [group, done] = await Promise.all([this.#track.next(), closed])
			if (done) return
			if (!group) break

			this.#runGroup(group).catch((err) => console.warn("failed to run group: ", err))
		}

		// TODO wait until all groups are done
		this.close()
	}

	async #runGroup(group: GroupReader) {
		const msg = new Message.Group(this.#id, group.sequence)
		const stream = await Writer.open(this.#quic, msg)

		for (;;) {
			const frame = await group.read()
			if (!frame) break

			await stream.u53(frame.byteLength)
			await stream.write(frame)
		}
	}

	close(err = new Closed()) {
		this.#closed.update(err)
		this.#track.close()
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
