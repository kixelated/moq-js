import * as Audio from "./audio"
import * as Message from "./message"

import { Connection } from "../transport/connection"
import { Watch } from "../common/async"
import { RingShared } from "../common/ring"
import * as MP4 from "../common/mp4"
import { AnnounceRecv } from "../transport/announce"
import { decodeInit } from "./container"
import { asError } from "../common/error"

export type Range = Message.Range
export type Timeline = Message.Timeline

// This class must be created on the main thread due to AudioContext.
export class Player {
	#conn: Connection
	#port: Message.Port

	// The audio context, which must be created on the main thread.
	#context?: Audio.Context

	// A periodically updated timeline
	#timeline = new Watch<Timeline | undefined>(undefined)

	constructor(conn: Connection) {
		this.#port = new Message.Port(this.#onMessage.bind(this)) // TODO await an async method instead
		this.#conn = conn
	}

	// Attach to the given canvas element
	render(canvas: HTMLCanvasElement) {
		// TODO refactor audio and video configuation
		const config = {
			audio: {
				channels: 2,
				sampleRate: 44100,
				ring: new RingShared(2, 44100),
			},
			video: {
				canvas: canvas.transferControlToOffscreen(),
			},
		}

		this.#port.sendConfig(config) // send to the worker
		this.#context = new Audio.Context(config.audio)
	}

	#onMessage(msg: Message.FromWorker) {
		if (msg.timeline) {
			this.#timeline.update(msg.timeline)
		}
	}

	close() {
		// TODO
	}

	// TODO support more arguments
	// TODO this API is gross
	async play(broadcast: Broadcast) {
		this.#port.sendPlay({ minBuffer: 0.5 }) // TODO

		// Call play on each track individually
		await Promise.all(broadcast.info.tracks.map((info) => this.#playTrack(broadcast, info.id.toString())))
	}

	async #playTrack(broadcast: Broadcast, name: string) {
		const sub = await broadcast.announce.subscribe(name)
		try {
			for (;;) {
				const segment = await sub.data()
				if (!segment) break

				this.#port.sendSegment({
					init: broadcast.init,
					header: segment.header,
					stream: segment.stream,
				})
			}
		} finally {
			await sub.close()
		}
	}

	seek(timestamp: number) {
		this.#port.sendSeek({ timestamp })
	}

	async *timeline() {
		for (;;) {
			const [timeline, next] = this.#timeline.value()
			if (timeline) yield timeline
			if (!next) break

			await next
		}
	}

	// Returns the next available broadcast.
	async broadcast() {
		const announce = await this.#conn.announce.recv()
		if (!announce) throw new Error("connection closed")

		await announce.ok()

		// TODO do this in parallel
		const subscribe = await announce.subscribe("0")
		try {
			const segment = await subscribe.data()
			if (!segment) throw new Error("no catalog data")

			const { header, stream } = segment

			if (header.sequence !== 0n) {
				throw new Error("TODO delta updates not supported")
			}

			const { info, raw } = await decodeInit(stream)

			await subscribe.close() // we done

			return { announce, info, init: raw }
		} catch (e) {
			const err = asError(e)

			// Close the subscription after we're done.
			await subscribe.close(1n, err.message)

			// Optional: Tell the other side we failed and won't use this broadcast
			await announce.close()

			throw err
		}
	}
}

export interface Broadcast {
	announce: AnnounceRecv
	info: MP4.Info
	init: Uint8Array
}
