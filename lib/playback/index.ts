import * as Message from "./webcodecs/message"

import { Connection } from "../transport/connection"
import { Catalog, isAudioTrack, isMp4Track, Mp4Track } from "../media/catalog"
import { asError } from "../common/error"

// We support two different playback implementations:
import Webcodecs from "./webcodecs"
import MSE from "./mse"
import { Client } from "../transport/client"

export type Range = Message.Range
export type Timeline = Message.Timeline

export interface PlayerConfig {
	url: string
	fingerprint?: string // URL to fetch TLS certificate fingerprint
	element: HTMLCanvasElement | HTMLVideoElement
}

// This class must be created on the main thread due to AudioContext.
export class Player {
	#backend: Webcodecs | MSE

	// A periodically updated timeline
	//#timeline = new Watch<Timeline | undefined>(undefined)

	#connection: Connection
	#catalog: Catalog

	// Running is a promise that resolves when the player is closed.
	// #close is called with no error, while #abort is called with an error.
	#running: Promise<void>
	#close!: () => void
	#abort!: (err: Error) => void

	private constructor(connection: Connection, catalog: Catalog, backend: Webcodecs | MSE) {
		this.#connection = connection
		this.#catalog = catalog
		this.#backend = backend

		const abort = new Promise<void>((resolve, reject) => {
			this.#close = resolve
			this.#abort = reject
		})

		// Async work
		this.#running = Promise.race([this.#run(), abort]).catch(this.#close)
	}

	static async create(config: PlayerConfig): Promise<Player> {
		const client = new Client({ url: config.url, fingerprint: config.fingerprint, role: "subscriber" })
		const connection = await client.connect()

		const catalog = await Catalog.fetch(connection)

		let backend

		if (config.element instanceof HTMLCanvasElement) {
			const element = config.element.transferControlToOffscreen()
			backend = new Webcodecs({ element, catalog })
		} else {
			backend = new MSE({ element: config.element })
		}

		return new Player(connection, catalog, backend)
	}

	async #run() {
		const inits = new Set<string>()
		const tracks = new Array<Mp4Track>()

		for (const track of this.#catalog.tracks) {
			if (!isMp4Track(track)) {
				throw new Error(`expected CMAF track`)
			}

			if (isAudioTrack(track) && this.#backend instanceof MSE) {
				// TODO temporary hack to disable audio in MSE
				continue
			}

			inits.add(track.init_track)
			tracks.push(track)
		}

		// Call #runInit on each unique init track
		// TODO do this in parallel with #runTrack to remove a round trip
		await Promise.all(Array.from(inits).map((init) => this.#runInit(init)))

		// Call #runTrack on each track
		await Promise.all(tracks.map((track) => this.#runTrack(track)))
	}

	async #runInit(name: string) {
		const sub = await this.#connection.subscribe("", name)
		try {
			const init = await Promise.race([sub.data(), this.#running])
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

		const sub = await this.#connection.subscribe("", track.data_track)
		try {
			for (;;) {
				const segment = await Promise.race([sub.data(), this.#running])
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
			//this.#timeline.update(msg.timeline)
		}
	}

	async close(err?: Error) {
		if (err) this.#abort(err)
		else this.#close()

		if (this.#connection) this.#connection.close()
		if (this.#backend) await this.#backend.close()
	}

	async closed(): Promise<Error | undefined> {
		try {
			await this.#running
		} catch (e) {
			return asError(e)
		}
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

	/*
	async *timeline() {
		for (;;) {
			const [timeline, next] = this.#timeline.value()
			if (timeline) yield timeline
			if (!next) break

			await next
		}
	}
	*/
}
