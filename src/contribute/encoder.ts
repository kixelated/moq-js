import { Deferred } from "../common/async"
import * as MP4 from "../common/mp4"

export const EncodecCodecs = [
	"avc1", // H.264
	"hev1", // HEVC (aka h.265)
	// "av01", // AV1
]

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

	// true if we should insert a keyframe, undefined when the encoder should decide
	#keyframeNext: true | undefined = true

	// Count the number of frames without a keyframe.
	#keyframeCounter = 0

	// inputs
	#input: ReadableStreamDefaultReader<VideoFrame>

	// outputs
	#init = new Deferred<MP4.TrackOptions>()
	frames: ReadableStream<EncodedVideoChunk>

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

		this.frames = new ReadableStream({
			start: this.#start.bind(this),
			pull: this.#pull.bind(this),
			cancel: this.#cancel.bind(this),
		})
	}

	static async isSupported(config: VideoEncoderConfig) {
		// Check if we support a specific codec family
		const short = config.codec.substring(0, 4)
		if (!EncodecCodecs.includes(short)) return false

		// Default to hardware encoding
		config.hardwareAcceleration ??= "prefer-hardware"

		// Default to CBR
		config.bitrateMode ??= "constant"

		// Default to realtime encoding
		config.latencyMode ??= "realtime"

		const res = await VideoEncoder.isConfigSupported(config)
		return !!res.supported
	}

	async init(): Promise<MP4.TrackOptions> {
		return this.#init.promise
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

		// Set keyFrame to undefined when we're not sure so the encoder can decide.
		encoder.encode(frame, { keyFrame: this.#keyframeNext })
		this.#keyframeNext = undefined

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
		const config = metadata?.decoderConfig
		if (config && this.#init.pending) {
			const codec = config.codec.substring(0, 4)

			const options: MP4.TrackOptions = {
				type: codec,
				width: config.codedWidth,
				height: config.codedHeight,
				timescale: 1_000_000,
				layer: metadata.temporalLayerId,
			}

			if (codec === "avc1") {
				options.avcDecoderConfigRecord = config.description
			} else if (codec === "hev1") {
				options.hevcDecoderConfigRecord = config.description
			}

			this.#init.resolve(options)
		}

		if (frame.type === "key") {
			this.#keyframeCounter = 0
		} else {
			this.#keyframeCounter += 1
			if (this.#keyframeCounter + this.#encoder.encodeQueueSize >= 2 * this.#config.framerate!) {
				this.#keyframeNext = true
			}
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
