import { Segment } from "./segment"
import { Notify } from "../common/async"
import { Chunk } from "./chunk"
import { Container } from "./container"
import { BroadcastConfig } from "./broadcast"

import * as Audio from "./audio"
import * as Video from "./video"

export class Track {
	name: string

	#init?: Uint8Array
	#segments: Segment[] = []

	#offset = 0 // number of segments removed from the front of the queue
	#closed = false
	#notify = new Notify()

	#container = new Container()
	#encoder: Audio.Encoder | Video.Encoder

	constructor(media: MediaStreamTrack, config: BroadcastConfig) {
		// TODO allow multiple tracks of the same kind
		this.name = media.kind

		this.#container = new Container()

		if (isAudioTrack(media)) {
			this.#encoder = new Audio.Encoder(media, config.audio)
		} else if (isVideoTrack(media)) {
			this.#encoder = new Video.Encoder(media, config.video)
		} else {
			throw new Error(`unknown track type: ${media.kind}`)
		}
	}

	async run() {
		// Encode the output into CMAF fragments
		const chunks = this.#encoder.frames.pipeThrough(this.#container.encode)

		// Split the container at keyframe boundaries
		const writer = new WritableStream({
			write: (chunk) => this.#write(chunk),
			close: () => this.#close(),
		})

		// Keep running until the encoder is closed
		return chunks.pipeTo(writer)
	}

	async #write(chunk: Chunk) {
		if (chunk.type === "init") {
			this.#init = chunk.data
			this.#notify.wake()
			return
		}

		let current = this.#segments.at(-1)
		if (!current || chunk.type === "key") {
			if (current) {
				await current.input.close()
			}

			const segment = new Segment(this.#offset + this.#segments.length)
			this.#segments.push(segment)

			console.log("pushed new segment", segment)

			this.#notify.wake()

			current = segment

			// Clear old segments
			while (this.#segments.length > 1) {
				const first = this.#segments[0]

				// Expire after 10s
				if (chunk.timestamp - first.timestamp < 10_000_000) break
				this.#segments.shift()
				this.#offset += 1

				await first.input.abort("expired")
			}
		}

		const writer = current.input.getWriter()

		if ((writer.desiredSize || 0) > 0) {
			await writer.write(chunk)
		} else {
			console.warn("dropping chunk", writer.desiredSize)
		}

		writer.releaseLock()
	}

	async #close() {
		const current = this.#segments.at(-1)
		if (current) {
			await current.input.close()
		}

		this.#closed = true
		this.#notify.wake()
	}

	async init(): Promise<Uint8Array> {
		while (!this.#init) {
			if (this.#closed) throw new Error("track closed")
			await this.#notify.wait()
		}

		return this.#init
	}

	// TODO generize this
	segments(): ReadableStream<Segment> {
		let pos = this.#offset

		return new ReadableStream({
			pull: async (controller) => {
				for (;;) {
					let index = pos - this.#offset
					if (index < 0) index = 0

					if (index < this.#segments.length) {
						controller.enqueue(this.#segments[index])
						pos += 1
						return // Called again when more data is requested
					}

					if (this.#closed) {
						controller.close()
						return
					}

					// Pull again on wakeup
					// NOTE: We can't return until we enqueue at least one segment.
					await this.#notify.wait()
				}
			},
		})
	}

	get config() {
		return this.#encoder.config
	}
}

function isAudioTrack(track: MediaStreamTrack): track is MediaStreamAudioTrack {
	return track.kind === "audio"
}

function isVideoTrack(track: MediaStreamTrack): track is MediaStreamVideoTrack {
	return track.kind === "video"
}
