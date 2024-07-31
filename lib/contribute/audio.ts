import { Group, Track } from "../transfork"
import { Closed } from "../transfork/error"
import { Chunk } from "./chunk"
import { Container } from "./container"

const SUPPORTED = [
	// TODO support AAC
	// "mp4a"
	"Opus",
]

export class Packer {
	#source: MediaStreamTrackProcessor<AudioData>
	#encoder: Encoder
	#container = new Container()
	#init: Track

	#data: Track
	#current?: Group

	constructor(track: MediaStreamAudioTrack, encoder: Encoder, init: Track, data: Track) {
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
			this.#init.appendGroup().writeFrames(chunk.data)
			return
		}

		// TODO use a fixed interval instead of keyframes (audio)
		// TODO actually just align with video
		if (!this.#current || chunk.type === "key") {
			if (this.#current) {
				this.#current.close()
			}

			this.#current = this.#data.appendGroup()
		}

		this.#current.writeFrame(chunk.data)
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
	#encoder!: AudioEncoder
	#encoderConfig: AudioEncoderConfig
	#decoderConfig?: AudioDecoderConfig

	frames: TransformStream<AudioData, AudioDecoderConfig | EncodedAudioChunk>

	constructor(config: AudioEncoderConfig) {
		this.#encoderConfig = config

		this.frames = new TransformStream({
			start: this.#start.bind(this),
			transform: this.#transform.bind(this),
			flush: this.#flush.bind(this),
		})
	}

	#start(controller: TransformStreamDefaultController<AudioDecoderConfig | EncodedAudioChunk>) {
		this.#encoder = new AudioEncoder({
			output: (frame, metadata) => {
				this.#enqueue(controller, frame, metadata)
			},
			error: (err) => {
				throw err
			},
		})

		this.#encoder.configure(this.#encoderConfig)
	}

	#transform(frame: AudioData) {
		this.#encoder.encode(frame)
		frame.close()
	}

	#enqueue(
		controller: TransformStreamDefaultController<AudioDecoderConfig | EncodedAudioChunk>,
		frame: EncodedAudioChunk,
		metadata?: EncodedAudioChunkMetadata,
	) {
		const config = metadata?.decoderConfig
		if (config && !this.#decoderConfig) {
			const config = metadata.decoderConfig
			if (!config) throw new Error("missing decoder config")

			controller.enqueue(config)
			this.#decoderConfig = config
		}

		controller.enqueue(frame)
	}

	#flush() {
		this.#encoder.close()
	}

	static async isSupported(config: AudioEncoderConfig) {
		// Check if we support a specific codec family
		const short = config.codec.substring(0, 4)
		if (!SUPPORTED.includes(short)) return false

		const res = await AudioEncoder.isConfigSupported(config)
		return !!res.supported
	}

	get config() {
		return this.#encoderConfig
	}
}
