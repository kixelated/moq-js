import * as Message from "./webcodecs/message"

import { Connection } from "../transport/connection"
import { Watch } from "../common/async"
import { Catalog, isMp4Track, Mp4Track } from "../media/catalog"
import { asError } from "../common/error"

// We support two different playback implementations:
import Webcodecs from "./webcodecs"
import MSE from "./mse"

export type Range = Message.Range
export type Timeline = Message.Timeline

export interface PlayerConfig {
	connection: Connection
	element: HTMLCanvasElement | HTMLVideoElement
}

// This class must be created on the main thread due to AudioContext.
export class Player {
	#backend: Webcodecs | MSE

	// A periodically updated timeline
	#timeline = new Watch<Timeline | undefined>(undefined)

	#catalog: Promise<Catalog>
	#running: Promise<void>

	readonly connection: Connection

	constructor(config: PlayerConfig) {
		if (config.element instanceof HTMLCanvasElement) {
			this.#backend = new Webcodecs({ element: config.element })
		} else {
			this.#backend = new MSE({ element: config.element })
		}

		this.connection = config.connection

		this.#catalog = Catalog.fetch(this.connection)

		// Async work
		this.#running = this.#catalog.then((catalog) => this.#run(catalog))
	}

	async #run(catalog: Catalog) {
		const inits = new Set<string>()
		const tracks = new Array<Mp4Track>()

		for (const track of catalog.tracks) {
			if (!isMp4Track(track)) {
				throw new Error(`expected CMAF track`)
			}

			inits.add(track.init_track)
			tracks.push(track)
		}

		this.#backend.start({ catalog })

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

			this.#backend.init({ stream: init.stream, name })
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

				this.#backend.segment({
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
		this.#backend.play({ minBuffer: 0.5 }) // TODO configurable
	}

	seek(timestamp: number) {
		this.#backend.seek({ timestamp })
	}
	*/

	async play() {
		await this.#backend.play()
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
