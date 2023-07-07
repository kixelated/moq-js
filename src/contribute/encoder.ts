import { Deferred } from "../common/async"
import * as MP4 from "../common/mp4"

export interface EncoderConfig {
	codec: string
	bitrate: number
}

export interface EncoderSupported {
	codecs: string[]
}

export class Encoder {
	#encoder!: VideoEncoder
	#config: VideoEncoderConfig

	#keyframeCounter = 0 // insert a keyframe every 2s at least

	// inputs
	#input: ReadableStreamDefaultReader<VideoFrame>

	// outputs
	#init = new Deferred<MP4.TrackOptions>()
	#frames: ReadableStream<EncodedVideoChunk>

	constructor(input: MediaStreamVideoTrack, config: EncoderConfig) {
		this.#input = new MediaStreamTrackProcessor({ track: input }).readable.getReader()
		const settings = input.getSettings()

		this.#config = {
			codec: config.codec,
			framerate: settings.frameRate ?? 30,
			width: settings.width ?? 1280,
			height: settings.height ?? 720,
			bitrate: config.bitrate,
			bitrateMode: "constant", // TODO configurable
			latencyMode: "realtime", // TODO configurable
		}

		this.#frames = new ReadableStream({
			start: this.#start.bind(this),
			pull: this.#pull.bind(this),
			cancel: this.#cancel.bind(this),
		})
	}

	static async supported(): Promise<EncoderSupported> {
		const codecs = new Array<string>()

		// TODO figure out the best codecs
		const available = ["av01.0.04M.08", "avc1.64001E"]
		const accelerations: HardwarePreference[] = ["prefer-hardware", "prefer-software"]

		// Check hardware acceleration first, but fall back to software if it's not available.
		for (const acceleration of accelerations) {
			for (const codec of available) {
				const { supported } = await VideoEncoder.isConfigSupported({
					codec,
					hardwareAcceleration: acceleration,
					width: 1280,
					height: 720,
					bitrate: 2_000_000,
					bitrateMode: "constant",
					framerate: 30,
				})

				if (supported && !codecs.includes(codec)) {
					codecs.push(codec)
				}
			}
		}

		return { codecs }
	}

	async init(): Promise<MP4.TrackOptions> {
		return this.#init.promise
	}

	async frame() {
		const reader = this.#frames.getReader()
		try {
			const { value } = await reader.read()
			return value
		} finally {
			reader.releaseLock()
		}
	}

	#start(controller: ReadableStreamDefaultController<EncodedVideoChunk>) {
		this.#encoder = new VideoEncoder({
			output: (frame, metadata) => {
				this.#enqueue(controller, frame, metadata)
			},
			error: (err) => {
				throw err
			},
		})

		this.#encoder.configure(this.#config)
	}

	async #pull(controller: ReadableStreamDefaultController<EncodedVideoChunk>) {
		const raw = await this.#input.read()
		if (raw.done) {
			this.#encoder.close()
			controller.close()
			return
		}

		const frame = raw.value
		const encoder = this.#encoder

		let insertKeyframe = false
		if (this.#keyframeCounter + encoder.encodeQueueSize >= 2 * this.#config.framerate!) {
			insertKeyframe = true
			this.#keyframeCounter = 0
		} else {
			this.#keyframeCounter += 1
		}

		encoder.encode(frame, { keyFrame: insertKeyframe })

		frame.close()
	}

	#cancel() {
		this.#encoder.close()
	}

	#enqueue(
		controller: ReadableStreamDefaultController<EncodedVideoChunk>,
		frame: EncodedVideoChunk,
		metadata?: EncodedVideoChunkMetadata
	) {
		if (metadata?.decoderConfig && this.#init.pending) {
			const config = metadata.decoderConfig

			console.log(metadata)

			// TODO remove MP4 specific stuff
			this.#init.resolve({
				type: config.codec.substring(0, 4),
				width: config.codedWidth,
				height: config.codedHeight,
				timescale: 1000,
				layer: metadata.temporalLayerId,
				description: config.description,
				description_boxes: [new MP4.Box()],
			})
		}

		if (frame.type === "key") {
			this.#keyframeCounter = 0
		}

		controller.enqueue(frame)
	}
}

/*
function isAudioTrack(track: MediaStreamTrack): track is MediaStreamAudioTrack {
	return track.kind === "audio"
}

function isVideoTrack(track: MediaStreamTrack): track is MediaStreamVideoTrack {
	return track.kind === "video"
}
*/
