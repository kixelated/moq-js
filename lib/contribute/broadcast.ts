import * as Transfork from "../transfork"
import * as Catalog from "../media/catalog"
import * as Audio from "./audio"
import * as Video from "./video"

import { isAudioTrackSettings, isVideoTrackSettings } from "../common/settings"

export interface BroadcastConfig {
	broadcast: string
	connection: Transfork.Connection
	media: MediaStream

	audio?: AudioEncoderConfig
	video?: VideoEncoderConfig
}

export interface BroadcastConfigTrack {
	codec: string
	bitrate: number
}

export class Broadcast {
	#config: BroadcastConfig
	#catalog: Catalog.Broadcast
	#connection: Transfork.Connection
	#broadcast: Transfork.Broadcast

	constructor(config: BroadcastConfig) {
		this.#connection = config.connection
		this.#config = config
		this.#catalog = new Catalog.Broadcast(config.broadcast)
		this.#broadcast = new Transfork.Broadcast(config.broadcast)

		for (const media of this.#config.media.getTracks()) {
			const priority = media.kind === "video" ? 2 : 1

			// TODO support multiple tracks of the same kind
			const name = media.kind
			const init = this.#broadcast.create(`${name}.mp4`, 0)
			const data = this.#broadcast.create(`${name}.m4s`, priority)

			const settings = media.getSettings()

			let catalog: Catalog.Track

			const mp4Catalog: Catalog.Mp4Track = {
				container: "mp4",
				kind: media.kind,
				init_track: init.name,
				data_track: data.name,
				priority,
			}

			if (isVideoTrackSettings(settings)) {
				if (!config.video) {
					throw new Error("no video configuration provided")
				}

				const encoder = new Video.Encoder(config.video)
				const packer = new Video.Packer(media as MediaStreamVideoTrack, encoder, init, data)

				// TODO handle error
				packer.run().catch((err) => console.error("failed to run video packer: ", err))

				const videoCatalog: Catalog.VideoTrack = {
					...mp4Catalog,
					kind: "video",
					codec: config.video.codec,
					width: settings.width,
					height: settings.height,
					frame_rate: settings.frameRate,
					bit_rate: config.video.bitrate,
				}

				catalog = videoCatalog
			} else if (isAudioTrackSettings(settings)) {
				if (!config.audio) {
					throw new Error("no audio configuration provided")
				}

				const encoder = new Audio.Encoder(config.audio)
				const packer = new Audio.Packer(media as MediaStreamAudioTrack, encoder, init, data)
				packer.run().catch((err) => console.error("failed to run audio packer: ", err)) // TODO handle error

				const audioCatalog: Catalog.AudioTrack = {
					...mp4Catalog,
					kind: "audio",
					codec: config.audio.codec,
					sample_rate: settings.sampleRate,
					sample_size: settings.sampleSize,
					channel_count: settings.channelCount,
					bit_rate: config.audio.bitrate,
				}

				catalog = audioCatalog
			} else {
				throw new Error(`unknown track type: ${media.kind}`)
			}

			this.#catalog.tracks.push(catalog)
		}

		const catalog = this.#broadcast.create(".catalog", 0)
		catalog.append().writeAll(this.#catalog.encode())

		this.#connection.announce(this.#broadcast)
	}

	// Attach the captured video stream to the given video element.
	attach(video: HTMLVideoElement) {
		video.srcObject = this.#config.media
	}

	close() {
		// TODO implement publish close
	}

	async closed() {
		// TODO make this better
		return this.#connection.closed()
	}
}
