import { Group, Track } from "../transfork"
import { Closed } from "../transfork/error"
import { Chunk } from "./chunk"
import { Container } from "./container"

const SUPPORTED = [
	"avc1", // H.264
	"hev1", // HEVC (aka h.265)
	// "av01", // TDOO support AV1
]

export interface EncoderSupported {
	codecs: string[]
}

export class Packer {
	#source: MediaStreamTrackProcessor<VideoFrame>
	#encoder: Encoder
	#container = new Container()
	#init: Track

	#data: Track
	#current?: Group

	constructor(track: MediaStreamVideoTrack, encoder: Encoder, init: Track, data: Track) {
		this.#source = new MediaStreamTrackProcessor({ track })
		this.#encoder = encoder
		this.#init = init
		this.#data = data
	}

	async run() {
		const output = new WritableStream({
			write: (chunk) => this.#write(chunk),
			close: () => this.#close(),
			abort: (e) => this.#close(e),
		})

		return this.#source.readable
			.pipeThrough(this.#encoder.frames)
			.pipeThrough(this.#container.encode)
			.pipeTo(output)
	}

	#write(chunk: Chunk) {
		if (chunk.type === "init") {
			this.#init.append().writeAll(chunk.data)
			return
		}

		if (!this.#current || chunk.type === "key") {
			if (this.#current) {
				this.#current.close()
			}

			this.#current = this.#data.append()
		}

		this.#current.write(chunk.data)
	}

	#close(err?: any) {
		const closed = Closed.from(err)
		if (this.#current) {
			this.#current.close(closed)
		}

		this.#init.close(closed)
		this.#data.close(closed)
	}
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
	frames: TransformStream<VideoFrame, VideoDecoderConfig | EncodedVideoChunk>

	constructor(config: VideoEncoderConfig) {
		config.bitrateMode ??= "constant"
		config.latencyMode ??= "realtime"

		this.#encoderConfig = config

		this.frames = new TransformStream({
			start: this.#start.bind(this),
			transform: this.#transform.bind(this),
			flush: this.#flush.bind(this),
		})
	}

	static async isSupported(config: VideoEncoderConfig) {
		// Check if we support a specific codec family
		const short = config.codec.substring(0, 4)
		if (!SUPPORTED.includes(short)) return false

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
		metadata?: EncodedVideoChunkMetadata,
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
