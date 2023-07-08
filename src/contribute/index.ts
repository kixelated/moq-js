import { Connection } from "../transport/connection"
import { Encoder, EncoderConfig } from "./encoder"
import { Container, ContainerSegment } from "./container"
import { SubscribeRecv } from "../transport/subscribe"
import { asError } from "../common/error"

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
	#container: Container
	#media: MediaStream
	#encoder: EncoderConfig // TODO make an encoder object
	#name: string

	running: Promise<void>

	constructor(config: BroadcastConfig) {
		this.#conn = config.conn
		this.#media = config.media
		this.#name = config.name
		this.#encoder = config.encoder

		this.#container = new Container()

		this.running = this.#run() // async
	}

	preview(video: HTMLVideoElement) {
		video.srcObject = this.#media
	}

	async #run() {
		await Promise.all([this.#runAnnounce(), this.#runMedia()])
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

		for (;;) {
			const frame = await encoder.frame()
			if (!frame) break

			track.add(frame)
		}

		track.end()
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
		const track = this.#container.track(id)
		if (!track) throw new Error(`no track with id ${id}`)

		for await (const segment of track.segments()) {
			this.#serveSegment(subscriber, segment).catch((e) => {
				const err = asError(e)
				console.warn(`failed to serve segment ${segment.sequence}`, err)
			})
		}
	}

	async #serveSegment(subscriber: SubscribeRecv, segment: ContainerSegment) {
		const stream = await subscriber.data({
			group: BigInt(segment.sequence),
			sequence: 0n,
			send_order: 0n, // TODO
		})

		const writer = stream.getWriter()
		try {
			for await (const fragment of segment.fragments()) {
				await writer.write(fragment)
			}
			await writer.close()
		} catch (e) {
			const err = asError(e)
			await writer.abort(err.message)
			throw err
		}
	}
}
