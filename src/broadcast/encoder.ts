import { Deferred } from "../common/async"

export interface Config {
	audio?: TrackConfig
	video?: TrackConfig
}

export interface TrackConfig {
	codec?: string
	bitrate?: number
}

export class Encoder {
	tracks: EncoderTrack[] = []

	constructor(source: MediaStream, config: Config = {}) {
		for (const t of source.getTracks()) {
			if (isVideoTrack(t)) {
				const track = new EncoderTrack(t, config.video)
				this.tracks.push(track)
			} else if (isAudioTrack(t)) {
				// TODO
			}
		}
	}
}

export class EncoderTrack {
	#encoder?: VideoEncoder
	#config: TrackConfig
	#keyframeCounter = 0 // insert a keyframe every 2s at least

	// inputs
	#input: MediaStreamTrackProcessor<VideoFrame>
	#settings: MediaTrackSettings

	// outputs
	#init = new Deferred<VideoDecoderConfig>()
	frames: ReadableStream<EncodedVideoChunk>

	constructor(input: MediaStreamVideoTrack, config: TrackConfig = {}) {
		this.#config = config

		this.frames = new ReadableStream({
			start: this.#start.bind(this),
			pull: this.#pull.bind(this),
			cancel: this.#cancel.bind(this),
		})

		this.#input = new MediaStreamTrackProcessor({ track: input })
		this.#settings = input.getSettings()
	}

	async init(): Promise<VideoDecoderConfig> {
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

		this.#encoder.configure({
			codec: this.#config.codec ?? "av1",
			width: this.#settings.width!,
			height: this.#settings.height!,
			framerate: this.#settings.frameRate!,
			bitrate: this.#config.bitrate ?? 2_000_000,
			latencyMode: "realtime", // TODO configurable
		})
	}

	async #pull(controller: ReadableStreamDefaultController<EncodedVideoChunk>) {
		const raw = await this.#input.readable.getReader().read()
		if (raw.done) {
			this.#encoder!.close()
			controller.close()
			return
		}

		const frame = raw.value
		const encoder = this.#encoder!

		let insertKeyframe = false
		if (this.#keyframeCounter + encoder.encodeQueueSize >= 2 * this.#settings.frameRate!) {
			insertKeyframe = true
			this.#keyframeCounter = 0
		} else {
			this.#keyframeCounter += 1
		}

		encoder.encode(frame, { keyFrame: insertKeyframe })

		frame.close()
	}

	#cancel() {
		this.#encoder!.close()
	}

	#enqueue(
		controller: ReadableStreamDefaultController<EncodedVideoChunk>,
		frame: EncodedVideoChunk,
		metadata?: EncodedVideoChunkMetadata
	) {
		if (metadata?.decoderConfig && this.#init.pending) {
			this.#init.resolve(metadata.decoderConfig)
		}

		if (frame.type === "key") {
			this.#keyframeCounter = 0
		}

		controller.enqueue(frame)
	}
}

function isAudioTrack(track: MediaStreamTrack): track is MediaStreamAudioTrack {
	return track.kind === "audio"
}

function isVideoTrack(track: MediaStreamTrack): track is MediaStreamVideoTrack {
	return track.kind === "video"
}
