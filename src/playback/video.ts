import { Frame, Timeline, findTimestamp } from "./timeline"
import * as MP4 from "../common/mp4"
import * as Message from "./message"

export class Renderer {
	private canvas: OffscreenCanvas
	private timeline: Timeline

	private queue: VideoFrame[]
	private decoder?: VideoDecoder
	private continuity?: number // the continuity of the last decoded frame
	private rendered?: number // the timestamp of the last rendered frame

	constructor(config: Message.ConfigVideo, timeline: Timeline) {
		this.canvas = config.canvas
		this.timeline = timeline

		this.queue = []

		self.requestAnimationFrame(this.draw.bind(this))
	}

	private render(frame: VideoFrame) {
		// Drop any old frames
		if (this.rendered && frame.timestamp <= this.rendered) {
			frame.close()
			return
		}

		// Fast path
		if (!this.queue.length) {
			this.queue.push(frame)
			return
		}

		// Insert the frame into the queue based on the timestamp.
		const index = findTimestamp(this.queue, frame.timestamp)
		this.queue.splice(index, 0, frame)
	}

	private draw(now: number) {
		// Draw and then queue up the next draw call.
		this.drawOnce(now)

		// Try to decode more frames.
		this.tryDecode()

		// Queue up the new draw frame.
		self.requestAnimationFrame(this.draw.bind(this))
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

		this.rendered = frame.timestamp
		frame.close()
	}

	private tryDecode() {
		for (;;) {
			// Check if there was a seek, and we need to flush any decode queue.
			const continuity = this.timeline.continuity()
			if (this.continuity && continuity !== this.continuity) {
				console.log("clearing decoder queue", continuity)

				// Flush the decoder queue.
				if (this.decoder) {
					this.decoder.close()
					this.decoder = undefined
				}

				// Close all existing frames
				for (;;) {
					const frame = this.queue.shift()
					if (!frame) break
					frame.close()
				}
			}

			this.continuity = continuity

			// There's already a large decoder queue.
			if (this.decoder && this.decoder.decodeQueueSize > 0) return

			// Get the next frame to render.
			const frame = this.timeline.video.next()
			if (!frame) return

			// Convert to wall clock time at decode for simplicity.
			const wall = 1000 * this.timeline.sync(frame.timestamp)!

			// Create or reuse the decoder.
			const decoder = this.makeDecoder(frame)
			decoder.decode(
				new EncodedVideoChunk({
					type: frame.sample.is_sync ? "key" : "delta",
					data: frame.sample.data,
					timestamp: wall,
				})
			)
		}
	}

	private makeDecoder(frame: Frame): VideoDecoder {
		// Reuse the decoder if it's not a sync frame
		if (this.decoder && !frame.sample.is_sync) return this.decoder

		// Configure the decoder using the AVC box for H.264
		// TODO it should be easy to support other codecs, just need to know the right boxes.
		const avcc = frame.sample.description.avcC
		if (!avcc) throw new Error("TODO only h264 is supported")

		const description = new MP4.Stream(new Uint8Array(avcc.size), 0, false)
		avcc.write(description)

		const decoder = new VideoDecoder({
			output: this.render.bind(this),
			error: console.error,
		})

		// Try queuing up more work when the decoder is ready.
		decoder.addEventListener("dequeue", this.tryDecode.bind(this))

		const track = frame.track
		if (!MP4.isVideoTrack(track)) throw new Error("expected video track")

		decoder.configure({
			codec: track.codec,
			codedHeight: track.video.height,
			codedWidth: track.video.width,
			description: description.buffer.slice(8),
			// optimizeForLatency: true
		})

		this.decoder = decoder

		return decoder
	}
}
