import { Connection } from "../transport/connection"
import { Encoder, EncoderConfig } from "./encoder"
import { Container, ContainerTrack } from "./container"
import { SubscribeRecv } from "../transport/subscribe"
import { asError } from "../common/error"
import { Segment, Segmenter } from "./segment"

export interface BroadcastConfig {
	conn: Connection
	media: MediaStream
	name: string // name of the broadcast
	encoder: EncoderConfig
}

export interface BroadcastConfigTrack {
	codec: string
	bitrate: number
}

export class Broadcast {
	#conn: Connection
	#media: MediaStream
	#encoder: EncoderConfig // TODO make an encoder object
	#name: string

	#container: Container
	#containerTracks = new Map<number, ContainerTrack>()

	constructor(config: BroadcastConfig) {
		this.#conn = config.conn
		this.#media = config.media
		this.#name = config.name
		this.#encoder = config.encoder

		this.#container = new Container()
	}

	// Run the broadcast.
	async run() {
		await Promise.all([this.#runAnnounce(), this.#runMedia()])
	}

	// Attach the captured video stream to the given video element.
	preview(video: HTMLVideoElement) {
		video.srcObject = this.#media
	}

	async #runMedia() {
		const promises = []
		for (const track of this.#media.getVideoTracks()) {
			const encode = this.#runEncode(track as MediaStreamVideoTrack, this.#encoder)
			promises.push(encode)
		}

		// TODO listen for "addtrack"

		await Promise.all(promises)
	}

	async #runEncode(media: MediaStreamVideoTrack, config: BroadcastConfigTrack) {
		const encoder = new Encoder(media, config)

		const init = await encoder.init()
		const track = this.#container.add(init)
		this.#containerTracks.set(track.id, track)

		// We don't use pipeThrough because we're not the ones who plan to read the data.
		await encoder.frames.pipeTo(track.frames.writable)
	}

	async #runAnnounce() {
		// Announce the namespace and wait for an explicit OK.
		const announce = await this.#conn.announce.send(this.#name)
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
			if (subscriber.name === "0") {
				await this.#serveCatalog(subscriber)
			} else {
				await this.#serveTrack(subscriber)
			}
		} catch (e) {
			const err = asError(e)
			await subscriber.close(1n, `failed to process subscribe: ${err.message}`)
		} finally {
			await subscriber.close()
		}
	}

	async #serveCatalog(subscriber: SubscribeRecv) {
		await subscriber.ack()

		const catalog = await this.#container.catalog()
		if (!catalog) throw new Error("no catalog produced")

		const stream = await subscriber.data({
			group: 0n,
			sequence: catalog.sequence,
			send_order: 0n, // Highest priority
		})

		const writer = stream.getWriter()

		try {
			await writer.write(catalog.init)
			await writer.close()
		} catch (e) {
			const err = asError(e)
			await writer.abort(err.message)
			throw err
		}
	}

	async #serveTrack(subscriber: SubscribeRecv) {
		const id = parseInt(subscriber.name)
		const track = this.#containerTracks.get(id)
		if (!track) throw new Error(`no track with id ${id}`)

		// TODO support multiple subscriptions for the same track
		const segments = track.frames.readable.pipeThrough(Segmenter()).getReader()

		for (;;) {
			const { value: segment, done } = await segments.read()
			if (done) break

			this.#serveSegment(subscriber, segment).catch((e) => {
				const err = asError(e)
				console.warn("failed to serve segment", err)
			})
		}
	}

	async #serveSegment(subscriber: SubscribeRecv, segment: Segment) {
		const stream = await subscriber.data({
			group: BigInt(segment.id),
			sequence: 0n,
			send_order: 0n, // TODO
		})

		await segment.fragments.pipeTo(stream)
	}
}
