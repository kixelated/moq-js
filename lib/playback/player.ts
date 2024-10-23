import { Connection } from "../transfork/connection"
import * as Catalog from "../karp/catalog"

import { Track } from "../transfork"

import * as Audio from "./audio"
import * as Video from "./video"
import { Timeline } from "./timeline"
import { GroupReader } from "../transfork/model"
import { Frame } from "../karp/frame"

export interface PlayerConfig {
	connection: Connection
	catalog: Catalog.Broadcast
	fingerprint?: string // URL to fetch TLS certificate fingerprint
	canvas: HTMLCanvasElement
}

// This class must be created on the main thread due to AudioContext.
export class Player {
	#connection: Connection
	#broadcast: Catalog.Broadcast

	// Running is a promise that resolves when the player is closed.
	// #close is called with no error, while #abort is called with an error.
	#running: Promise<void>
	#close!: () => void
	#abort!: (err: Error) => void

	// Timeline receives samples, buffering them and choosing the timestamp to render.
	#timeline = new Timeline()

	#audio?: Audio.Renderer
	#video?: Video.Renderer

	constructor(config: PlayerConfig) {
		this.#connection = config.connection
		this.#broadcast = config.catalog

		const abort = new Promise<void>((resolve, reject) => {
			this.#close = resolve
			this.#abort = reject
		})

		const running = []

		// Only configure audio is we have an audio track
		const audio = (config.catalog.audio || []).at(0)
		if (audio) {
			this.#audio = new Audio.Renderer(audio, this.#timeline.audio)
			running.push(this.#runAudio(audio))
		}

		const video = (config.catalog.video || []).at(0)
		if (video) {
			this.#video = new Video.Renderer(video, config.canvas, this.#timeline.video)
			running.push(this.#runVideo(video))
		}

		// Async work
		this.#running = Promise.race([abort, ...running]).catch(this.#close)
	}

	async #runAudio(audio: Catalog.Audio) {
		const track = new Track(this.#broadcast.path, audio.track.name, audio.track.priority)
		const sub = await this.#connection.subscribe(new Track(this.#broadcast.path, track.name, track.priority))

		try {
			for (;;) {
				const group = await Promise.race([sub.nextGroup(), this.#running])
				if (!group) break

				this.#runAudioGroup(audio, group)
					.catch((err) => console.warn("failed to run group: ", err))
					.finally(() => group.close())
			}
		} finally {
			sub.close()
		}
	}

	async #runVideo(video: Catalog.Video) {
		const track = new Track(this.#broadcast.path, video.track.name, video.track.priority)
		const sub = await this.#connection.subscribe(new Track(this.#broadcast.path, track.name, track.priority))

		try {
			for (;;) {
				const group = await Promise.race([sub.nextGroup(), this.#running])
				if (!group) break

				this.#runVideoGroup(video, group)
					.catch((err) => console.warn("failed to run group: ", err))
					.finally(() => group.close())
			}
		} finally {
			sub.close()
		}
	}

	async #runAudioGroup(audio: Catalog.Audio, group: GroupReader) {
		const timeline = this.#timeline.audio

		// Create a queue that will contain each frame
		const queue = new TransformStream<Frame>({})
		const segment = queue.writable.getWriter()

		// Add the segment to the timeline
		const segments = timeline.segments.getWriter()
		await segments.write({
			sequence: group.id,
			frames: queue.readable,
		})
		segments.releaseLock()

		// Read each chunk, decoding the MP4 frames and adding them to the queue.
		for (;;) {
			const frame = await Frame.decode(group)
			if (!frame) break

			await segment.write(frame)
		}

		// We done.
		await segment.close()
	}

	async #runVideoGroup(video: Catalog.Video, group: GroupReader) {
		const timeline = this.#timeline.video

		// Create a queue that will contain each MP4 frame.
		const queue = new TransformStream<Frame>({})
		const segment = queue.writable.getWriter()

		// Add the segment to the timeline
		const segments = timeline.segments.getWriter()
		await segments.write({
			sequence: group.id,
			frames: queue.readable,
		})
		segments.releaseLock()

		for (;;) {
			const frame = await Frame.decode(group)
			if (!frame) break

			await segment.write(frame)
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
