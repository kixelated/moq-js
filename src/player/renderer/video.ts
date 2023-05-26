import * as Message from "../message"
import Frame from "../frame"

import * as MP4 from "../../mp4"
import * as Time from "../time"

export default class Video {
	canvas: OffscreenCanvas
	queue: Array<VideoFrame>
	decoders: Map<number, VideoDecoder> // a decoder per GoP

	animate?: number // non-zero if requestAnimationFrame has been called
	last?: number // the timestamp of the last rendered frame

	constructor(config: Message.Config) {
		this.canvas = config.canvas
		this.queue = []
		this.decoders = new Map()
	}

	push(frame: Frame) {
		const decoder = this.decoder(frame)
		decoder.decode(
			new EncodedVideoChunk({
				type: frame.sample.is_sync ? "key" : "delta",
				data: frame.sample.data,
				timestamp: 1000 * frame.timestamp, // convert to milliseconds to match performance.now()
			})
		)
	}

	private decoder(frame: Frame): VideoDecoder {
		let decoder = this.decoders.get(frame.group)
		if (decoder) return decoder

		// Configure the decoder using the AVC box for H.264
		// TODO it should be easy to support other codecs, just need to know the right boxes.
		const avcc = frame.sample.description.avcC
		if (!avcc) throw new Error("TODO only h264 is supported")

		const description = new MP4.Stream(new Uint8Array(avcc.size), 0, false)
		avcc.write(description)

		decoder = new VideoDecoder({
			output: this.render.bind(this),
			error: console.error,
		})

		const track = frame.track as MP4.VideoTrack

		decoder.configure({
			codec: track.codec,
			codedHeight: track.video.height,
			codedWidth: track.video.width,
			description: description.buffer?.slice(8),
			// optimizeForLatency: true
		})

		this.decoders.set(frame.group, decoder)

		return decoder
	}

	private render(frame: VideoFrame) {
		// Drop any old frames
		if (this.last && frame.timestamp <= this.last) {
			frame.close()
			return
		}

		// Fast path
		if (!this.queue.length) {
			this.queue.push(frame)
			return
		}

		// Insert the frame into the queue based on the timestamp.
		const index = Time.search(this.queue, frame.timestamp)
		this.queue.splice(index, 0, frame)
	}

	private draw(now: number) {
		// Draw and then queue up the next draw call.
		this.drawOnce(now)

		// Queue up the new draw frame.
		this.animate = self.requestAnimationFrame(this.draw.bind(this))
	}

	private drawOnce(now: number) {
		if (!this.queue.length) {
			return
		}

		let frame = this.queue[0]

		if (frame.timestamp > now) {
			// nothing to render yet, wait for the next animation frame
			return
		}

		this.queue.shift()

		// Check if we should skip some frames
		while (this.queue.length) {
			const next = this.queue[0]
			if (next.timestamp > now) break

			frame.close()
			frame = this.queue.shift()!
		}

		const ctx = this.canvas.getContext("2d")
		ctx!.drawImage(frame, 0, 0, this.canvas.width, this.canvas.height) // TODO aspect ratio

		this.last = frame.timestamp
		frame.close()
	}

	play(_play: Message.Play) {
		// Queue up to render the next frame.
		if (!this.animate) {
			this.animate = self.requestAnimationFrame(this.draw.bind(this))
		}
	}
}
