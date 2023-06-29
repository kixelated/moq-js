import { Connection, Control } from "~/transport"
import { Encoder, Container, ContainerTrack } from "./media"

export class Broadcaster {
	#conn: Connection

	// A map of track IDs to subscription IDs
	#subscriptions: Map<string, bigint> = new Map()

	#namespace?: string

	constructor(conn: Connection) {
		this.#conn = conn
	}

	async run(namespace: string) {
		this.#namespace = namespace
		await Promise.all([this.#runEncoder(), this.#runControl()])
	}

	async #runEncoder() {
		const constraints = {
			audio: false,
			video: {
				aspectRatio: { ideal: 16 / 9 },
				width: { max: 1280 },
				height: { max: 720 },
				frameRate: { max: 60 },
			},
		}

		const stream = await window.navigator.mediaDevices.getUserMedia(constraints)
		const encoder = new Encoder(stream)
		const container = new Container(encoder)

		const tracks = []
		for (const track of container.tracks) {
			tracks.push(this.#runTrack(track))
		}

		await Promise.all(tracks)
	}

	async #runTrack(track: ContainerTrack) {
		const objects = await this.#conn.objects
		const reader = track.segments.getReader()

		for (;;) {
			const res = await reader.read()
			if (res.done) break

			const segment = res.value

			// TODO keep recent segments in memory for new subscribers
			const subscribeId = this.#subscriptions.get(track.name)
			if (subscribeId === undefined) {
				segment.cancel()
				continue
			}

			const stream = await objects.send({
				track: subscribeId,
				group: BigInt(segment.sequence),
				sequence: 0n,
				send_order: 0n, // TODO
			})

			segment.fragments.pipeTo(stream) // async
		}
	}

	async #runControl() {
		// Immediately announce our namespace
		this.#sendControl({
			type: Control.Type.Announce,
			namespace: this.#namespace!,
		})

		// Wait for the connection to be established.
		const control = await this.#conn.control

		// Read any messages.
		for (;;) {
			const msg = await control.recv()
			if (!msg) break

			await this.#receiveControl(msg)
		}
	}

	async #receiveControl(msg: Control.Message) {
		console.log("received message", msg)

		switch (msg.type) {
			case Control.Type.AnnounceOk:
				return // cool i guess
			case Control.Type.AnnounceError:
				return new Error(`failed to announce: ${msg.reason} (${msg.code})`)
			case Control.Type.Subscribe:
				try {
					await this.#receiveSubscribe(msg)

					await this.#sendControl({
						type: Control.Type.SubscribeOk,
						id: msg.id,
					})
				} catch (err) {
					await this.#sendControl({
						type: Control.Type.SubscribeError,
						id: msg.id,
						reason: `${err}`,
						code: 1n,
					})
				}
				break
			default:
				throw new Error(`unknown message type: ${msg.type}`)
		}
	}

	async #receiveSubscribe(msg: Control.Subscribe) {
		if (msg.namespace !== this.#namespace) {
			throw new Error(`unknown namespace: ${msg.namespace}`)
		}

		// Track names are integers,
		for (const [trackName, subscriptionID] of this.#subscriptions) {
			if (subscriptionID === msg.id) {
				throw new Error("duplicate subscription ID")
			} else if (trackName === msg.name) {
				throw new Error("duplicate track name")
			}
		}

		this.#subscriptions.set(msg.name, msg.id)
	}

	async #sendControl(msg: Control.Message) {
		// Wait for the connection to be established.
		const control = await this.#conn.control

		console.log("sending message", msg)
		return control.send(msg)
	}
}
