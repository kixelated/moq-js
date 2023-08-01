import { Segment } from "./segment"
import { Notify } from "../common/async"
import { Chunk } from "./chunk"
import { Container } from "./container"
import { BroadcastConfig } from "./broadcast"

import * as Audio from "./audio"
import * as Video from "./video"

export class Track {
	name: string

	#inits: Uint8Array[] = []
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
		let current = this.#segments.at(-1)
		if (!current || chunk.type === "key") {
			if (current) {
				await current.input.close()
			}

			const segment = new Segment(this.#offset + this.#segments.length)
			this.#segments.push(segment)
			this.#notify.wake()

			current = segment

			// Clear any expired segments
			const now = performance.now()

			while (this.#segments.length) {
				const expires = this.#segments[0].expires
				if (expires && expires > now) break
				this.#segments.shift()
			}
		}

		const writer = current.input.getWriter()
		await writer.write(chunk)
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

	init(): ReadableStream<Uint8Array> {
		let index = 0

		return new ReadableStream({
			pull: (controller) => {
				if (index < this.#segments.length) {
					controller.enqueue(this.#inits[index])
					index += 1
					return
				}

				if (this.#closed) {
					controller.close()
					return
				}

				// Pull again on wakeup
				return this.#notify.next()
			},
		})
	}

	// TODO generize this
	segments(): ReadableStream<Segment> {
		let pos = this.#offset

		return new ReadableStream({
			pull: (controller) => {
				let index = pos - this.#offset
				if (index < 0) index = 0

				if (index < this.#segments.length) {
					controller.enqueue(this.#segments[index])
					pos += 1
					return
				}

				if (this.#closed) {
					controller.close()
					return
				}

				// Pull again on wakeup
				return this.#notify.next()
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
