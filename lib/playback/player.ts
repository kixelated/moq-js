import { Connection } from "../transfork/connection"
import * as Catalog from "../media/catalog"
import { asError } from "../common/error"
import * as MP4 from "../media/mp4"

import { Track } from "../transfork"

import * as Audio from "./audio"
import * as Video from "./video"
import { RingShared } from "../common/ring"
import { Timeline } from "./timeline"
import { GroupReader } from "../transfork/model"

export interface PlayerConfig {
	connection: Connection
	catalog: Catalog.Broadcast
	fingerprint?: string // URL to fetch TLS certificate fingerprint
	canvas: HTMLCanvasElement
}

// This class must be created on the main thread due to AudioContext.
export class Player {
	#connection: Connection
	#catalog: Catalog.Broadcast

	// Running is a promise that resolves when the player is closed.
	// #close is called with no error, while #abort is called with an error.
	#running: Promise<void>
	#close!: () => void
	#abort!: (err: Error) => void

	// Timeline receives samples, buffering them and choosing the timestamp to render.
	#timeline = new Timeline()

	#audio?: Audio.Renderer
	#video?: Video.Renderer

	// A map of init tracks.
	#inits = new Map<string, Promise<Uint8Array>>()

	constructor(config: PlayerConfig) {
		this.#connection = config.connection
		this.#catalog = config.catalog

		const abort = new Promise<void>((resolve, reject) => {
			this.#close = resolve
			this.#abort = reject
		})

		let sampleRate: number | undefined
		let channels: number | undefined

		for (const track of config.catalog.tracks) {
			if (Catalog.isAudioTrack(track)) {
				if (sampleRate && track.sample_rate !== sampleRate) {
					throw new Error(`TODO multiple audio tracks with different sample rates`)
				}

				sampleRate = track.sample_rate
				channels = Math.max(track.channel_count, channels ?? 0)
			}
		}

		// Only configure audio is we have an audio track
		if (sampleRate && channels) {
			this.#audio = new Audio.Renderer({
				channels: channels,
				sampleRate: sampleRate,
				ring: new RingShared(2, sampleRate / 20), // 50ms
				timeline: this.#timeline.audio,
			})
		}

		// TODO only if we have a video track
		this.#video = new Video.Renderer({
			canvas: config.canvas,
			timeline: this.#timeline.video,
		})

		// Async work
		this.#running = Promise.race([this.#run(), abort]).catch(this.#close)
	}

	async #run() {
		const tracks = new Array<Catalog.Mp4Track>()

		for (const track of this.#catalog.tracks) {
			if (!Catalog.isMp4Track(track)) {
				throw new Error(`expected CMAF track`)
			}

			if (!this.#inits.has(track.init_track)) {
				// Load each unique init track
				this.#inits.set(track.init_track, this.#runInit(track.init_track))
			}

			tracks.push(track)
		}

		// Call #runTrack on each track
		await Promise.all(tracks.map((track) => this.#runTrack(track)))
	}

	async #runInit(name: string): Promise<Uint8Array> {
		const track = this.#connection.subscribe(new Track(this.#catalog.broadcast, name, 0))

		try {
			const init = await track.next()
			if (!init) throw new Error("no init data")

			// We don't care what type of reader we get, we just want the payload.
			const chunk = await init.read()
			if (!chunk) throw new Error("no init chunk")

			return chunk
		} finally {
			track.close()
		}
	}

	async #runTrack(track: Catalog.Mp4Track) {
		if (track.kind !== "audio" && track.kind !== "video") {
			throw new Error(`unknown track kind: ${track.kind}`)
		}

		const subscribe = new Track(this.#catalog.broadcast, track.data_track, track.priority)
		const reader = this.#connection.subscribe(subscribe)
		try {
			for (;;) {
				const group = await Promise.race([reader.next(), this.#running])
				if (!group) break

				this.#runGroup(track, group)
					.catch((err) => console.warn("failed to run group: ", err))
					.finally(() => group.close())
			}
		} finally {
			reader.close()
		}
	}

	async #runGroup(track: Catalog.Mp4Track, group: GroupReader) {
		const init = await this.#inits.get(track.init_track)
		if (!init) throw new Error(`missing init track: ${track.init_track}`) // impossible

		// Create a new stream that we will use to decode.
		const container = new MP4.Parser(init)

		const timeline = track.kind === "audio" ? this.#timeline.audio : this.#timeline.video

		// Create a queue that will contain each MP4 frame.
		const queue = new TransformStream<MP4.Frame>({})
		const segment = queue.writable.getWriter()

		// Add the segment to the timeline
		const segments = timeline.segments.getWriter()
		await segments.write({
			sequence: group.sequence,
			frames: queue.readable,
		})
		segments.releaseLock()

		// Read each chunk, decoding the MP4 frames and adding them to the queue.
		for (;;) {
			const chunk = await group.read()
			if (!chunk) break

			const frames = container.decode(chunk)
			for (const frame of frames) {
				await segment.write(frame)
			}
		}

		// We done.
		await segment.close()
	}

	close(err?: Error) {
		if (err) this.#abort(err)
		else this.#close()

		if (this.#connection) this.#connection.close()
		this.#audio?.close()
		this.#video?.close()
	}

	async closed(): Promise<void> {
		await this.#running
	}

	play() {
		this.#audio?.play()
	}
}
