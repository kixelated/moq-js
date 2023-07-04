import { Connection } from "../transport/connection"
import { Encoder, Config } from "./encoder"
import { Container, ContainerSegment, ContainerTrack } from "./container"
import { SubscribeRecv } from "../transport/subscribe"
import { asError } from "../common/error"

export class Broadcaster {
	#conn: Connection

	// A map of track IDs to subscriptions
	#subscriptions = new Map<string, SubscribeRecv[]>()

	running: Promise<void>

	constructor(conn: Connection) {
		this.#conn = conn
		this.running = this.#run() // async
	}

	async serve(name: string, stream: MediaStream, config: Config = {}) {
		const announce = await this.#conn.announce.send(name)

		try {
			const encoder = new Encoder(stream, config)
			const container = new Container(encoder)

			const tracks = []
			for (const track of container.tracks) {
				tracks.push(this.#serveTrack(track))
			}

			await Promise.all(tracks)
			await announce.close()
		} catch (e) {
			const err = asError(e)
			await announce.close(1n, `error serving track: ${err.message}`)
		}
	}

	async #serveTrack(track: ContainerTrack) {
		const waiting: SubscribeRecv[] = []
		this.#subscriptions.set(track.name, waiting)

		const reader = track.segments.getReader()

		for (;;) {
			const { value, done } = await reader.read()
			if (done) break

			for (let i = 0; i < waiting.length; i += 1) {
				const subscriber = waiting[i]
				if (subscriber.closed) {
					// Remove from future iterations
					waiting.splice(i, 1)
					i -= 1

					continue
				}

				// Serve the segment, catching any errors and closing the subscription.
				this.#serveSegment(subscriber, value).catch(async (e) => {
					const err = asError(e)
					await subscriber.close(1n, `failed to serve segment: ${err.message}`)
				})
			}
		}
	}

	async #serveSegment(subscriber: SubscribeRecv, segment: ContainerSegment) {
		const stream = await subscriber.data({
			group: BigInt(segment.sequence),
			sequence: 0n,
			send_order: 0n, // TODO
		})

		await segment.fragments.pipeTo(stream)
	}

	async #run() {
		for (;;) {
			const subscriber = await this.#conn.subscribe.recv()

			try {
				// TODO verify that the namespace is valid
				const waiting = this.#subscriptions.get(subscriber.name)
				if (waiting === undefined) {
					throw new Error("track name does not exist")
				}

				// TODO serve any existing segments for the track

				waiting.push(subscriber)

				await subscriber.ack()
			} catch (e) {
				const err = asError(e)
				await subscriber.close(1n, `failed to process subscribe: ${err.message}`)
			}
		}
	}
}
