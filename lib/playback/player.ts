import * as Message from "./worker/message"
import { Port } from "./port"

import { Context } from "./context"
import { Connection } from "../transport/connection"
import { Watch } from "../common/async"
import { RingShared } from "../common/ring"
import { Catalog, isAudioTrack, isMp4Track, Mp4Track } from "../media/catalog"
import { asError } from "../common/error"

export type Range = Message.Range
export type Timeline = Message.Timeline

export interface PlayerConfig {
	connection: Connection
	canvas: HTMLCanvasElement
}

// This class must be created on the main thread due to AudioContext.
export class Player {
	#port: Port

	// The video canvas
	#canvas: OffscreenCanvas

	// The audio context, which must be created on the main thread.
	#context?: Context

	// A periodically updated timeline
	#timeline = new Watch<Timeline | undefined>(undefined)

	#catalog: Promise<Catalog>
	#running: Promise<void>

	readonly connection: Connection

	constructor(config: PlayerConfig) {
		this.#port = new Port(this.#onMessage.bind(this)) // TODO await an async method instead

		this.#canvas = config.canvas.transferControlToOffscreen()
		this.connection = config.connection

		this.#catalog = Catalog.fetch(this.connection)

		// Async work
		this.#running = this.#run()
	}

	async #run() {
		const inits = new Set<string>()
		const tracks = new Array<Mp4Track>()

		const catalog = await this.#catalog

		let sampleRate: number | undefined
		let channels: number | undefined

		for (const track of catalog.tracks) {
			if (!isMp4Track(track)) {
				throw new Error(`expected CMAF track`)
			}

			inits.add(track.init_track)
			tracks.push(track)

			if (isAudioTrack(track)) {
				if (sampleRate && track.sample_rate !== sampleRate) {
					throw new Error(`TODO multiple audio tracks with different sample rates`)
				}

				sampleRate = track.sample_rate
				channels = Math.max(track.channel_count, channels ?? 0)
			}
		}

		const config: Message.Config = {}

		// Only configure audio is we have an audio track
		if (sampleRate && channels) {
			config.audio = {
				channels: channels,
				sampleRate: sampleRate,
				ring: new RingShared(2, sampleRate / 20), // 50ms
			}

			this.#context = new Context(config.audio)
		}

		// TODO only send the canvas if we have a video track
		config.video = {
			canvas: this.#canvas,
		}

		this.#port.sendConfig(config) // send to the worker

		// Call #runInit on each unique init track
		// TODO do this in parallel with #runTrack to remove a round trip
		await Promise.all(Array.from(inits).map((init) => this.#runInit(init)))

		// Call #runTrack on each track
		await Promise.all(tracks.map((track) => this.#runTrack(track)))
	}

	async #runInit(name: string) {
		const sub = await this.connection.subscribe("", name)
		try {
			const init = await sub.data()
			if (!init) throw new Error("no init data")

			this.#port.sendInit({
				name: name,
				stream: init.stream,
			})
		} finally {
			await sub.close()
		}
	}

	async #runTrack(track: Mp4Track) {
		if (track.kind !== "audio" && track.kind !== "video") {
			throw new Error(`unknown track kind: ${track.kind}`)
		}

		const sub = await this.connection.subscribe("", track.data_track)
		try {
			for (;;) {
				const segment = await sub.data()
				if (!segment) break

				this.#port.sendSegment({
					init: track.init_track,
					kind: track.kind,
					header: segment.header,
					stream: segment.stream,
				})
			}
		} finally {
			await sub.close()
		}
	}

	#onMessage(msg: Message.FromWorker) {
		if (msg.timeline) {
			this.#timeline.update(msg.timeline)
		}
	}

	close() {
		// TODO
	}

	async closed(): Promise<Error> {
		try {
			await this.#running
			return new Error("closed") // clean termination
		} catch (e) {
			return asError(e)
		}
	}

	async catalog(): Promise<Catalog> {
		return this.#catalog
	}

	/*
	play() {
		this.#port.sendPlay({ minBuffer: 0.5 }) // TODO configurable
	}

	seek(timestamp: number) {
		this.#port.sendSeek({ timestamp })
	}
	*/

	async *timeline() {
		for (;;) {
			const [timeline, next] = this.#timeline.value()
			if (timeline) yield timeline
			if (!next) break

			await next
		}
	}
}
