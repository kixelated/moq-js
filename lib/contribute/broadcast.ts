import * as Transfork from "../transfork"
import * as Catalog from "../media/catalog"
import * as Audio from "./audio"
import * as Video from "./video"

import { isAudioTrackSettings, isVideoTrackSettings } from "../common/settings"
import { Closed } from "../transfork/error"

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
	#broadcast: Transfork.Broadcast

	private constructor(config: BroadcastConfig, broadcast: Transfork.Broadcast) {
		this.#config = config
		this.#broadcast = broadcast
	}

	async create(config: BroadcastConfig): Promise<Broadcast> {
		const tracks: Catalog.Track[] = []

		for (const media of this.#config.media.getTracks()) {
			const priority = media.kind === "video" ? 2 : 1

			// TODO support multiple tracks of the same kind
			const name = media.kind
			const init = this.#broadcast.createTrack(`${name}.mp4`, 0)
			const data = this.#broadcast.createTrack(`${name}.m4s`, priority)

			const settings = media.getSettings()

			if (isVideoTrackSettings(settings)) {
				if (!config.video) {
					throw new Error("no video configuration provided")
				}

				const encoder = new Video.Encoder(config.video)
				const packer = new Video.Packer(media as MediaStreamVideoTrack, encoder, init, data)

				// TODO handle error
				packer.run().catch((err) => console.error("failed to run video packer: ", err))

				const video: Catalog.VideoTrack = {
					namespace: config.broadcast,
					name: `${name}.m4s`,
					initTrack: `${name}.mp4`,
					selectionParams: {
						mimeType: "video/mp4",
						codec: config.video.codec,
						width: settings.width,
						height: settings.height,
						framerate: settings.frameRate,
						bitrate: config.video.bitrate,
					},
				}

				tracks.push(video)
			} else if (isAudioTrackSettings(settings)) {
				if (!config.audio) {
					throw new Error("no audio configuration provided")
				}

				const encoder = new Audio.Encoder(config.audio)
				const packer = new Audio.Packer(media as MediaStreamAudioTrack, encoder, init, data)
				packer.run().catch((err) => console.error("failed to run audio packer: ", err)) // TODO handle error

				const audio: Catalog.AudioTrack = {
					namespace: config.broadcast,
					name: `${name}.m4s`,
					initTrack: `${name}.mp4`,
					selectionParams: {
						mimeType: "audio/ogg",
						codec: config.audio.codec,
						samplerate: settings.sampleRate,
						//sampleSize: settings.sampleSize,
						channelConfig: `${settings.channelCount}`,
						bitrate: config.audio.bitrate,
					},
				}

				tracks.push(audio)
			} else {
				throw new Error(`unknown track type: ${media.kind}`)
			}
		}

		const catalog = {
			version: 1,
			streamingFormat: 1,
			streamingFormatVersion: "0.2",
			supportsDeltaUpdates: false,
			commonTrackFields: {
				packaging: "cmaf",
				renderGroup: 1,
			},
			tracks,
		}

		const catalogTrack = this.#broadcast.createTrack(".catalog", 0)
		catalogTrack.appendGroup().writeFrames(Catalog.encode(catalog))

		await config.connection.announce(this.#broadcast)

		return new Broadcast(config, this.#broadcast)
	}

	close(closed?: Closed) {
		this.#broadcast.close(closed)
	}
}
