import { Frame, Component } from "./timeline"
import * as MP4 from "../../media/mp4"
import * as Message from "./message"

interface DecoderConfig {
	codec: string
	description?: ArrayBuffer | Uint8Array | DataView
	codedWidth?: number
	codedHeight?: number
	displayAspectWidth?: number
	displayAspectHeight?: number
	colorSpace?: {
		primaries?: "bt709" | "bt470bg" | "smpte170m"
		transfer?: "bt709" | "smpte170m" | "iec61966-2-1"
		matrix?: "rgb" | "bt709" | "bt470bg" | "smpte170m"
	}
	hardwareAcceleration?: "no-preference" | "prefer-hardware" | "prefer-software"
	optimizeForLatency?: boolean
}

export class Renderer {
	#canvas: OffscreenCanvas
	#timeline: Component

	#decoder!: VideoDecoder
	#queue: TransformStream<Frame, VideoFrame>

	#decoderConfig?: DecoderConfig
	#waitingForKeyframe: boolean = true

	constructor(config: Message.ConfigVideo, timeline: Component) {
		this.#canvas = config.canvas
		this.#timeline = timeline

		this.#queue = new TransformStream({
			start: this.#start.bind(this),
			transform: this.#transform.bind(this),
		})

		this.#run().catch(console.error)
	}

	async #run() {
		const reader = this.#timeline.frames.pipeThrough(this.#queue).getReader()
		for (;;) {
			const { value: frame, done } = await reader.read()
			if (done) break

			self.requestAnimationFrame(() => {
				this.#canvas.width = frame.displayWidth
				this.#canvas.height = frame.displayHeight

				const ctx = this.#canvas.getContext("2d")
				if (!ctx) throw new Error("failed to get canvas context")

				ctx.drawImage(frame, 0, 0, frame.displayWidth, frame.displayHeight) // TODO respect aspect ratio
				frame.close()
			})
		}
	}

	#start(controller: TransformStreamDefaultController<VideoFrame>) {
		this.#decoder = new VideoDecoder({
			output: (frame: VideoFrame) => {
				controller.enqueue(frame)
			},
			error: console.error,
		})
	}

	#transform(frame: Frame) {
		if (this.#decoder.state === "closed") {
			console.warn("Decoder is closed. Skipping frame.")
			return
		}

		const { sample, track } = frame

		// Reset the decoder on video track change
		if (this.#decoderConfig && this.#decoder.state == "configured") {
			if (MP4.isVideoTrack(track)) {
				const configMismatch =
					this.#decoderConfig.codec !== track.codec ||
					this.#decoderConfig.codedWidth !== track.video.width ||
					this.#decoderConfig.codedHeight !== track.video.height

				if (configMismatch) {
					this.#decoder.reset()
					this.#decoderConfig = undefined
				}
			}
		}

		// Configure the decoder with the first frame
		if (this.#decoder.state !== "configured") {
			const desc = sample.description
			const box = desc.avcC ?? desc.hvcC ?? desc.vpcC ?? desc.av1C
			if (!box) throw new Error(`unsupported codec: ${track.codec}`)

			const buffer = new MP4.Stream(undefined, 0, MP4.Stream.BIG_ENDIAN)
			box.write(buffer)
			const description = new Uint8Array(buffer.buffer, 8) // Remove the box header.

			if (!MP4.isVideoTrack(track)) throw new Error("expected video track")

			this.#decoderConfig = {
				codec: track.codec,
				codedHeight: track.video.height,
				codedWidth: track.video.width,
				description,
				// optimizeForLatency: true
			}

			this.#decoder.configure(this.#decoderConfig)
			if (!frame.sample.is_sync) {
				this.#waitingForKeyframe = true
			} else {
				this.#waitingForKeyframe = false
			}
		}

		//At the start of decode , VideoDecoder seems to expect a key frame after configure() or flush()
		if (this.#decoder.state == "configured") {
			if (this.#waitingForKeyframe && !frame.sample.is_sync) {
				console.warn("Skipping non-keyframe until a keyframe is found.")
				return
			}

			// On arrival of a keyframe, allow decoding and stop waiting for a keyframe.
			if (frame.sample.is_sync) {
				this.#waitingForKeyframe = false
			}

			const chunk = new EncodedVideoChunk({
				type: frame.sample.is_sync ? "key" : "delta",
				data: frame.sample.data,
				timestamp: frame.sample.dts / frame.track.timescale,
			})

			this.#decoder.decode(chunk)
		}
	}
}
