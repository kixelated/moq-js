import { Frame, Component } from "./timeline"
import * as MP4 from "../common/mp4"
import * as Message from "./message"

export class Renderer {
	#canvas: OffscreenCanvas
	#timeline: Component

	#decoder?: VideoDecoder
	#continuity?: number // the continuity of the last decoded frame
	#rendered?: number // the timestamp of the last rendered frame

	#queue: TransformStream<Frame, VideoFrame>
	#render?: number

	constructor(config: Message.ConfigVideo, timeline: Component) {
		this.#canvas = config.canvas
		this.#timeline = timeline

		this.#queue = new TransformStream({
			transform: this.#decode.bind(this),
		})

		this.#run().catch(console.error)
	}

	async #run() {
		const reader = this.#timeline.frames.pipeThrough(this.#queue).getReader()
		for (;;) {
			const { value: frame, done } = await reader.read()
			if (done) break

			this.#render = self.requestAnimationFrame(() => {
				const ctx = this.#canvas.getContext("2d")
				ctx!.drawImage(frame, 0, 0, this.#canvas.width, this.#canvas.height) // TODO aspect ratio

				this.#rendered = frame.timestamp
				frame.close()
			})
		}
	}

	#decode(frame: Frame, controller: TransformStreamDefaultController<VideoFrame>) {
		// Create or reuse the decoder.
		const decoder = this.#makeDecoder(controller, frame)

		const chunk = new EncodedVideoChunk({
			type: frame.sample.is_sync ? "key" : "delta",
			data: frame.sample.data,
			timestamp: frame.timestamp,
		})

		decoder.decode(chunk)
	}

	#makeDecoder(controller: TransformStreamDefaultController<VideoFrame>, frame: Frame): VideoDecoder {
		// Reuse the decoder if it exists
		if (this.#decoder) return this.#decoder

		const { sample, track } = frame

		const desc = sample.description
		const box = desc.avcC ?? desc.hvcC ?? desc.vpcC ?? desc.av1C
		if (!box) throw new Error(`unsupported codec: ${track.codec}`)

		const buffer = new MP4.Stream()
		buffer.endianness = MP4.Stream.BIG_ENDIAN
		box.write(buffer)
		const description = new Uint8Array(buffer.buffer, 8) // Remove the box header.

		const decoder = new VideoDecoder({
			output: (frame: VideoFrame) => {
				controller.enqueue(frame)
			},
			error: console.error,
		})

		if (!MP4.isVideoTrack(track)) throw new Error("expected video track")

		decoder.configure({
			codec: track.codec,
			codedHeight: track.video.height,
			codedWidth: track.video.width,
			description,
			// optimizeForLatency: true
		})

		this.#decoder = decoder

		return decoder
	}
}
