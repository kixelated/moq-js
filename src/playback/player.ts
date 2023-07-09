import * as Audio from "./audio"
import * as Message from "./message"
import { Broadcast } from "./catalog"

import { Connection } from "../transport/connection"
import { Watch } from "../common/async"
import { RingShared } from "../common/ring"
import * as MP4 from "../common/mp4"

export type Range = Message.Range
export type Timeline = Message.Timeline

// This class must be created on the main thread due to AudioContext.
export class Player {
	#conn: Connection
	#port: Message.Port
	#broadcast: Broadcast

	// The audio context, which must be created on the main thread.
	#context?: Audio.Context

	// A periodically updated timeline
	#timeline = new Watch<Timeline | undefined>(undefined)

	constructor(conn: Connection, broadcast: Broadcast) {
		this.#broadcast = broadcast
		this.#port = new Message.Port(this.#onMessage.bind(this)) // TODO await an async method instead
		this.#conn = conn
	}

	async run() {
		const info = await this.#broadcast.info()
		const init = await this.#broadcast.init()

		const tracks = info.tracks.map((track) => this.#runTrack(init, track))

		await Promise.all(tracks)
	}

	async #runTrack(init: Uint8Array, track: MP4.Track) {
		const sub = await this.#broadcast.subscribe(track.id)
		try {
			for (;;) {
				const segment = await sub.data()
				if (!segment) break
				console.log("got segment", segment)

				this.#port.sendSegment({
					init,
					header: segment.header,
					stream: segment.stream,
				})
			}
		} finally {
			await sub.close()
		}
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

	play() {
		this.#port.sendPlay({ minBuffer: 0.5 }) // TODO configurable
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
}
