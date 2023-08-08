import * as Audio from "./audio"
import * as Message from "./message"
import { Broadcast } from "./announced"

import { Connection } from "../transport/connection"
import { Watch } from "../common/async"
import { RingShared } from "../common/ring"
import { isTrackMp4, TrackMp4 } from "../common/catalog"

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
		const catalog = await this.#broadcast.catalog

		const inits = new Set<string>()
		const tracks = new Array<TrackMp4>()

		for (const track of catalog.tracks) {
			if (!isTrackMp4(track)) {
				throw new Error(`expected CMAF track`)
			}

			inits.add(track.init)
			tracks.push(track)
		}

		// Call #runInit on each unique init track
		// TODO do this in parallel with #runTrack to remove a round trip
		await Promise.all(Array.from(inits).map((init) => this.#runInit(init)))

		// Call #runTrack on each track
		await Promise.all(tracks.map((track) => this.#runTrack(track)))
	}

	async #runInit(name: string) {
		const sub = await this.#broadcast.subscribe(name)
		try {
			const init = await sub.data()
			if (!init) throw new Error("no init data")

			if (init.header.sequence !== 0n) {
				throw new Error("TODO multiple objects per init not supported")
			}

			this.#port.sendInit({
				name: name,
				stream: init.stream,
			})
		} finally {
			await sub.close()
		}
	}

	async #runTrack(track: TrackMp4) {
		if (track.kind !== "audio" && track.kind !== "video") {
			throw new Error(`unknown track kind: ${track.kind}`)
		}

		console.log("subscribe to", track.data)

		const sub = await this.#broadcast.subscribe(track.data)
		try {
			for (;;) {
				const segment = await sub.data()
				if (!segment) break

				if (segment.header.sequence !== 0n) {
					throw new Error("TODO multiple objects per segment not supported")
				}

				this.#port.sendSegment({
					init: track.init,
					kind: track.kind,
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
				ring: new RingShared(2, 4410), // 100ms
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
