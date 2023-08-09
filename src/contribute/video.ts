export const EncoderCodecs = [
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
	#encoderConfig: VideoEncoderConfig
	#decoderConfig?: VideoDecoderConfig

	// true if we should insert a keyframe, undefined when the encoder should decide
	#keyframeNext: true | undefined = true

	// Count the number of frames without a keyframe.
	#keyframeCounter = 0

	// Converts raw rames to encoded frames.
	#encode: TransformStream<VideoFrame, VideoDecoderConfig | EncodedVideoChunk>

	// Output
	frames: ReadableStream<VideoDecoderConfig | EncodedVideoChunk>

	constructor(input: MediaStreamVideoTrack, config: EncoderConfig) {
		const settings = input.getSettings()
		if (!isVideoTrackSettings(settings)) {
			throw new Error("expected video track")
		}

		this.#encoderConfig = {
			codec: config.codec,
			framerate: settings.frameRate,
			width: settings.width,
			height: settings.height,
			bitrate: config.bitrate,
			bitrateMode: "constant", // TODO configurable
			latencyMode: "realtime", // TODO configurable
		}

		this.#encode = new TransformStream({
			start: this.#start.bind(this),
			transform: this.#transform.bind(this),
			flush: this.#flush.bind(this),
		})

		const reader = new MediaStreamTrackProcessor({ track: input }).readable
		this.frames = reader.pipeThrough(this.#encode)
	}

	static async isSupported(config: VideoEncoderConfig) {
		// Check if we support a specific codec family
		const short = config.codec.substring(0, 4)
		if (!EncoderCodecs.includes(short)) return false

		// Default to hardware encoding
		config.hardwareAcceleration ??= "prefer-hardware"

		// Default to CBR
		config.bitrateMode ??= "constant"

		// Default to realtime encoding
		config.latencyMode ??= "realtime"

		const res = await VideoEncoder.isConfigSupported(config)
		return !!res.supported
	}

	#start(controller: TransformStreamDefaultController<EncodedVideoChunk>) {
		this.#encoder = new VideoEncoder({
			output: (frame, metadata) => {
				this.#enqueue(controller, frame, metadata)
			},
			error: (err) => {
				throw err
			},
		})

		this.#encoder.configure(this.#encoderConfig)
	}

	#transform(frame: VideoFrame) {
		const encoder = this.#encoder

		// Set keyFrame to undefined when we're not sure so the encoder can decide.
		encoder.encode(frame, { keyFrame: this.#keyframeNext })
		this.#keyframeNext = undefined

		frame.close()
	}

	#enqueue(
		controller: TransformStreamDefaultController<VideoDecoderConfig | EncodedVideoChunk>,
		frame: EncodedVideoChunk,
		metadata?: EncodedVideoChunkMetadata
	) {
		if (!this.#decoderConfig) {
			const config = metadata?.decoderConfig
			if (!config) throw new Error("missing decoder config")

			controller.enqueue(config)
			this.#decoderConfig = config
		}

		if (frame.type === "key") {
			this.#keyframeCounter = 0
		} else {
			this.#keyframeCounter += 1
			if (this.#keyframeCounter + this.#encoder.encodeQueueSize >= 2 * this.#encoderConfig.framerate!) {
				this.#keyframeNext = true
			}
		}

		controller.enqueue(frame)
	}

	#flush() {
		this.#encoder.close()
	}

	get config() {
		return this.#encoderConfig
	}
}

// MediaTrackSettings can represent both audio and video, which means a LOT of possibly undefined properties.
// This is a fork of the MediaTrackSettings interface with properties required for video.
interface VideoTrackSettings {
	deviceId: string
	groupId: string

	aspectRatio: number
	facingMode: "user" | "environment" | "left" | "right"
	frameRate: number
	height: number
	resizeMode: "none" | "crop-and-scale"
	width: number
}

function isVideoTrackSettings(settings: MediaTrackSettings): settings is VideoTrackSettings {
	return "width" in settings
}
