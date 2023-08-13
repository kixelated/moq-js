import { Connection } from "../transport/connection"
import { SubscribeRecv } from "../transport/subscribe"
import { asError } from "../common/error"
import { Segment } from "./segment"
import { Track } from "./track"
import { Catalog, Mp4Track, VideoTrack, Track as CatalogTrack, AudioTrack } from "../common/catalog"

import * as Audio from "./audio"
import * as Video from "./video"
import { isAudioTrackSettings, isVideoTrackSettings } from "../common/track"

export interface BroadcastConfig {
	conn: Connection
	media: MediaStream
	name: string // name of the broadcast

	audio: Audio.EncoderConfig
	video: Video.EncoderConfig
}

export interface BroadcastConfigTrack {
	codec: string
	bitrate: number
}

export class Broadcast {
	#conn: Connection
	#media: MediaStream
	#catalog: Catalog
	#config: BroadcastConfig

	#tracks = new Map<string, Track>()

	constructor(config: BroadcastConfig) {
		this.#conn = config.conn
		this.#media = config.media
		this.#config = config

		this.#catalog = new Catalog()

		for (const media of this.#media.getTracks()) {
			const track = new Track(media, config)
			this.#tracks.set(track.name, track)

			const settings = media.getSettings()

			let catalog: CatalogTrack

			const mp4Catalog: Mp4Track = {
				container: "mp4",
				namespace: config.name,
				kind: media.kind,
				init: `${track.name}.mp4`,
				data: `${track.name}.m4s`,
			}

			if (isVideoTrackSettings(settings)) {
				const videoCatalog: VideoTrack = {
					...mp4Catalog,
					kind: "video",
					codec: track.config.codec,
					width: settings.width,
					height: settings.height,
					frame_rate: settings.frameRate,
					bit_rate: config.video.bitrate,
				}

				catalog = videoCatalog
			} else if (isAudioTrackSettings(settings)) {
				const audioCatalog: AudioTrack = {
					...mp4Catalog,
					kind: "audio",
					codec: track.config.codec,
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
	}

	// Run the broadcast.
	async run() {
		await Promise.all([this.#runAnnounce(), this.#runTracks()])
	}

	async #runTracks() {
		// For each track, call the run method.
		const tracks = [...this.#tracks.values()]
		await Promise.all(tracks.map((track) => track.run()))
	}

	// Attach the captured video stream to the given video element.
	preview(video: HTMLVideoElement) {
		video.srcObject = this.#media
	}

	async #runAnnounce() {
		// Announce the namespace and wait for an explicit OK.
		const announce = await this.#conn.announce.send(this.#config.name)
		await announce.ok()

		try {
			for (;;) {
				const subscriber = await this.#conn.subscribe.recv()
				if (!subscriber) break

				// Run an async task to serve each subscription.
				this.#serveSubscribe(subscriber).catch((e) => {
					const err = asError(e)
					console.warn("failed to serve subscribe", err)
				})
			}
		} catch (e) {
			const err = asError(e)
			await announce.close(1n, `error serving broadcast: ${err.message}`)
		}
	}

	async #serveSubscribe(subscriber: SubscribeRecv) {
		try {
			const [base, ext] = splitExt(subscriber.name)
			if (ext === "catalog") {
				await this.#serveCatalog(subscriber, base)
			} else if (ext === "mp4") {
				await this.#serveInit(subscriber, base)
			} else if (ext === "m4s") {
				await this.#serveTrack(subscriber, base)
			} else {
				throw new Error(`unknown subscription: ${subscriber.name}`)
			}
		} catch (e) {
			const err = asError(e)
			await subscriber.close(1n, `failed to process subscribe: ${err.message}`)
		} finally {
			// TODO we can't close subscribers because there's no support for clean termination
			// await subscriber.close()
		}
	}

	async #serveCatalog(subscriber: SubscribeRecv, name: string) {
		// We only support ".catalog"
		if (name !== "") throw new Error(`unknown catalog: ${name}`)

		const bytes = this.#catalog.encode()

		// Send a SUBSCRIBE_OK
		await subscriber.ack()

		const stream = await subscriber.data({
			group: 0n,
			sequence: 0n,
			send_order: 0, // TODO Highest priority
		})

		const writer = stream.getWriter()

		try {
			await writer.write(bytes)
			await writer.close()
		} catch (e) {
			const err = asError(e)
			await writer.abort(err.message)
			throw err
		} finally {
			writer.releaseLock()
		}
	}

	async #serveInit(subscriber: SubscribeRecv, name: string) {
		const track = this.#tracks.get(name)
		if (!track) throw new Error(`no track with name ${subscriber.name}`)

		// Send a SUBSCRIBE_OK
		await subscriber.ack()

		const init = await track.init()

		// Create a new stream for each segment.
		const stream = await subscriber.data({
			group: 0n,
			sequence: 0n,
			send_order: 0, // TODO
		})

		const writer = stream.getWriter()

		// TODO make a helper to pipe a Uint8Array to a stream
		try {
			// Write the init segment to the stream.
			await writer.write(init)
			await writer.close()
		} catch (e) {
			const err = asError(e)
			await writer.abort(err.message)
			throw err
		} finally {
			writer.releaseLock()
		}
	}

	async #serveTrack(subscriber: SubscribeRecv, name: string) {
		const track = this.#tracks.get(name)
		if (!track) throw new Error(`no track with name ${subscriber.name}`)

		// Send a SUBSCRIBE_OK
		await subscriber.ack()

		const segments = track.segments().getReader()

		for (;;) {
			const { value: segment, done } = await segments.read()
			if (done) break

			// Serve the segment and log any errors that occur.
			this.#serveSegment(subscriber, segment).catch((e) => {
				const err = asError(e)
				console.warn("failed to serve segment", err)
			})
		}
	}

	async #serveSegment(subscriber: SubscribeRecv, segment: Segment) {
		// Create a new stream for each segment.
		const stream = await subscriber.data({
			group: BigInt(segment.id),
			sequence: 0n,
			send_order: 0, // TODO
		})

		// Pipe the segment to the stream.
		await segment.chunks().pipeTo(stream)
	}
}

function splitExt(s: string): [string, string] {
	const i = s.lastIndexOf(".")
	if (i < 0) throw new Error(`no extension found`)
	return [s.substring(0, i), s.substring(i + 1)]
}
