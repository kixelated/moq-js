import * as Transfork from "../transfork"
import * as Catalog from "../karp/catalog"
import * as Audio from "./audio"
import * as Video from "./video"

import { isAudioTrackSettings, isVideoTrackSettings } from "../common/settings"
import { Closed } from "../transfork/error"

export interface BroadcastConfig {
	name: string
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

	constructor(config: BroadcastConfig) {
		this.#config = config
		this.#broadcast = new Transfork.Broadcast(config.name)
	}

	async publish(connection: Transfork.Connection) {
		const broadcast: Catalog.Broadcast = { name: this.#config.name, audio: [], video: [] }

		for (const media of this.#config.media.getTracks()) {
			const settings = media.getSettings()

			const track: Catalog.Track = {
				name: media.id, // TODO way too verbose
				priority: media.kind == "video" ? 1 : 2,
				group_order: "desc",
				group_expires: 0,
			}

			const data = this.#broadcast.createTrack(track.name, track.priority)

			if (isVideoTrackSettings(settings)) {
				if (!this.#config.video) {
					throw new Error("no video configuration provided")
				}

				const encoder = new Video.Encoder(this.#config.video)
				const packer = new Video.Packer(media as MediaStreamVideoTrack, encoder, data)

				// TODO handle error
				packer.run().catch((err) => console.error("failed to run video packer: ", err))

				const decoder = await encoder.decoderConfig()
				const description = decoder.description ? new Uint8Array(decoder.description as ArrayBuffer) : undefined

				const video: Catalog.Video = {
					track: track,
					codec: decoder.codec,
					description: description,
					resolution: { width: settings.width, height: settings.height },
					frame_rate: settings.frameRate,
					timescale: 1000,
					bitrate: this.#config.video.bitrate,
				}

				broadcast.video.push(video)
			} else if (isAudioTrackSettings(settings)) {
				if (!this.#config.audio) {
					throw new Error("no audio configuration provided")
				}

				const encoder = new Audio.Encoder(this.#config.audio)
				const packer = new Audio.Packer(media as MediaStreamAudioTrack, encoder, data)
				packer.run().catch((err) => console.error("failed to run audio packer: ", err)) // TODO handle error

				const decoder = await encoder.decoderConfig()

				const audio: Catalog.Audio = {
					track: track,
					codec: decoder.codec,
					sample_rate: settings.sampleRate,
					channel_count: settings.channelCount,
					bitrate: this.#config.audio.bitrate,
					timescale: 1000,
				}

				broadcast.audio.push(audio)
			} else {
				throw new Error(`unknown track type: ${media.kind}`)
			}
		}

		const catalogTrack = this.#broadcast.createTrack("catalog.json", 0)
		catalogTrack.appendGroup().writeFrames(Catalog.encode(broadcast))

		await connection.publish(this.#broadcast)
	}

	close(closed?: Closed) {}
}
