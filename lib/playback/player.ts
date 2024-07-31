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
	catalog: Catalog.Root
	fingerprint?: string // URL to fetch TLS certificate fingerprint
	canvas: HTMLCanvasElement
}

// This class must be created on the main thread due to AudioContext.
export class Player {
	#connection: Connection
	#catalog: Catalog.Root

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
				if (sampleRate && track.selectionParams.samplerate !== sampleRate) {
					throw new Error(`TODO multiple audio tracks with different sample rates`)
				}

				sampleRate = track.selectionParams.samplerate
				channels = Math.max(+track.selectionParams.channelConfig, channels ?? 0)
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

			if (!track.initTrack) {
				continue
			}

			if (!track.namespace) {
				throw new Error(`missing track namespace`)
			}

			if (!this.#inits.has(track.initTrack)) {
				// Load each unique init track
				this.#inits.set(track.initTrack, this.#runInit(track.namespace, track.initTrack))
			}

			tracks.push(track)
		}

		// Call #runTrack on each track
		await Promise.all(tracks.map((track) => this.#runTrack(track)))
	}

	async #runInit(broadcast: string, name: string): Promise<Uint8Array> {
		const sub = await this.#connection.subscribe(new Track(broadcast, name, 0))

		try {
			const init = await sub.nextGroup()
			if (!init) throw new Error("no init data")

			// We don't care what type of reader we get, we just want the payload.
			const chunk = await init.readFrame()
			if (!chunk) throw new Error("no init chunk")

			return chunk
		} finally {
			sub.close()
		}
	}

	async #runTrack(track: Catalog.Mp4Track) {
		if (!track.namespace) {
			throw new Error(`missing track namespace`)
		}

		let priority = 0
		if (Catalog.isAudioTrack(track)) {
			priority = 1
		} else if (Catalog.isVideoTrack(track)) {
			priority = 2
		} else {
			throw new Error(`unknown track type`)
		}

		const sub = await this.#connection.subscribe(new Track(track.namespace, track.name, priority))
		try {
			for (;;) {
				const group = await Promise.race([sub.nextGroup(), this.#running])
				if (!group) break

				this.#runGroup(track, group)
					.catch((err) => console.warn("failed to run group: ", err))
					.finally(() => group.close())
			}
		} finally {
			sub.close()
		}
	}

	async #runGroup(track: Catalog.Mp4Track, group: GroupReader) {
		if (!track.initTrack) {
			throw new Error(`missing init track`)
		}

		const init = await this.#inits.get(track.initTrack)
		if (!init) throw new Error(`missing init track: ${track.initTrack}`)

		// Create a new stream that we will use to decode.
		const container = new MP4.Parser(init)

		let timeline
		if (Catalog.isAudioTrack(track)) {
			timeline = this.#timeline.audio
		} else if (Catalog.isVideoTrack(this.#timeline.video)) {
			timeline = this.#timeline.video
		} else {
			throw new Error(`unknown track type`)
		}

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
			const chunk = await group.readFrame()
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
