import * as Audio from "./audio"
import * as Message from "./message"

import { Connection } from "../transport/connection"
import { Notify } from "../common/async"
import { RingShared } from "../common/ring"
import * as MP4 from "../common/mp4"
import { AnnounceRecv } from "../transport/announce"
import { decodeInit } from "./decoder"

export type Range = Message.Range
export type Timeline = Message.Timeline

// This class must be created on the main thread due to AudioContext.
export class Player {
	#conn: Connection
	#port: Message.Port

	// The audio context, which must be created on the main thread.
	#context?: Audio.Context

	// The most recent timeline message received from the worker.
	#timeline?: Message.Timeline

	// A list of consumers waiting for the next timeline message.
	#timelineNotify = new Notify()

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

	async #onMessage(msg: Message.FromWorker) {
		if (msg.timeline) {
			this.#onTimeline(msg.timeline)
		}
	}

	#onTimeline(timeline: Message.Timeline) {
		// Save the latest timeline timeline
		this.#timeline = timeline
		this.#timelineNotify.broadcast()
	}

	close() {
		// TODO
	}

	// TODO support arguments
	play() {
		this.#port.sendPlay({ minBuffer: 0.5 }) // TODO
	}

	seek(timestamp: number) {
		this.#port.sendSeek({ timestamp })
	}

	async *timeline() {
		for (;;) {
			if (this.#timeline) {
				yield this.#timeline
			}
			await this.#timelineNotify.wait()
		}
	}

	// Returns the next available broadcast.
	async broadcast() {
		const announce = await this.#conn.announce.recv()
		await announce.ok()

		// TODO do this in parallel
		const subscribe = await announce.subscribe("catalog")
		try {
			const [header, stream] = await subscribe.data()

			if (header.sequence !== 0n) {
				throw new Error("TODO delta updates not supported")
			}

			const { info, raw } = await decodeInit(stream)
			return new Broadcast(this, announce, info, raw)
		} catch (e) {
			// Optional: Tell the other side we failed and won't use this broadcast
			announce.close()
		} finally {
			// Close the subscription after we're done.
			subscribe.close()
		}
	}
}

export class Broadcast {
	#player: Player
	#announce: AnnounceRecv

	readonly info: MP4.Info
	#raw: Uint8Array

	constructor(player: Player, announce: AnnounceRecv, info: MP4.Info, raw: Uint8Array) {
		this.#player = player
		this.#announce = announce
		this.info = info
		this.#raw = raw
	}

	get name() {
		return this.#announce.namespace
	}

	async play() {
		const subs = []

		for (const track of this.info.tracks) {
			const sub = await this.#announce.subscribe(track.id.toString())
			subs.push(sub)
		}

		for (const sub of subs) {
			await sub.ack
		}

		for (const sub of subs) {
			// Blocks until the end of the subscription
			await sub.error
		}
	}
}
