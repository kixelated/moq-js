import * as Audio from "./audio"
import { Port } from "./port"

import { Connection, Control } from "../transport"
import { Deferred, Notify } from "../shared/async"
import * as Ring from "../shared/ring"
import * as Message from "../shared/message"

export type Range = Message.Range

// This class must be created on the main thread due to AudioContext.
export class Player {
	#conn: Connection
	#port: Port

	// The audio context, which must be created on the main thread.
	#context?: Audio.Context

	// The namespace as announced by the server
	#namespace?: string

	// The most recent timeline message received from the worker.
	#timeline?: Message.Timeline

	// A list of consumers waiting for the next timeline message.
	#timelineNotify = new Notify()

	// Store the list of announced broadcasts, and notify when a new one arrives.
	#broadcasts = new Map<string, BroadcastInner>()
	#broadcastsNotify = new Notify()

	// A list of active subscriptions
	#subs = new Map<bigint, Subscribe>()
	#subsNext = 0n

	#error?: any

	connected: Promise<void>
	running: Promise<void>

	constructor(conn: Connection) {
		this.#port = new Port(this.#onMessage.bind(this)) // TODO await an async method instead

		this.#conn = conn

		this.connected = this.#conn.connected
		this.running = this.#run() // Async
	}

	// Attach to the given canvas element
	render(canvas: HTMLCanvasElement) {
		// TODO refactor audio and video configuation
		const config = {
			audio: {
				channels: 2,
				sampleRate: 44100,
				ring: new Ring.Init(2, 44100),
			},
			video: {
				canvas,
			},
		}

		this.#port.sendConfig(config) // send to the worker
		this.#context = new Audio.Context(config.audio)
	}

	async #run(): Promise<void> {
		try {
			await Promise.all([this.#runObjects(), this.#runControl()])
		} catch (e) {
			this.#error = e
			this.#broadcastsNotify.broadcast()
			this.#timelineNotify.broadcast()

			throw e
		}
	}

	async #runObjects() {
		const objects = await this.#conn.objects

		for (;;) {
			const next = await objects.recv()
			if (!next) break

			const header = next[0]
			const stream = next[1]

			const sub = this.#subs.get(header.track)
			if (!sub) continue

			this.#port.sendSegment({ broadcast: sub.broadcast, header, stream })
		}
	}

	async #runControl() {
		// Wait for the connection to be established.
		const control = await this.#conn.control

		for (;;) {
			const msg = await control.recv()
			if (!msg) break

			await this.#receiveControl(msg)
		}
	}

	async #receiveControl(msg: Control.Message) {
		console.log("received message", msg)

		switch (msg.type) {
			case Control.Type.Announce:
				return this.#receiveAnnounce(msg)
			case Control.Type.SubscribeOk:
				return this.#receiveSubscribeOk(msg)
			case Control.Type.SubscribeError:
				return this.#receiveSubscribeError(msg)
			default:
				throw new Error(`unknown message type: ${msg.type}`)
		}
	}

	async #receiveAnnounce(msg: Control.Announce) {
		this.#broadcasts.set(msg.namespace, new BroadcastInner(msg.namespace))
		this.#broadcastsNotify.broadcast()

		// Immediately subscribe to announced namespace to get the catalog.
		await this.#subscribe(msg.namespace, "catalog")
	}

	#receiveSubscribeOk(msg: Control.SubscribeOk) {
		if (!this.#subs.has(msg.id)) {
			throw new Error(`unknown subscription: ${msg.id}`)
		}
	}

	#receiveSubscribeError(msg: Control.SubscribeError) {
		const sub = this.#subs.get(msg.id)
		if (!sub) {
			throw new Error(`unknown subscription: ${msg.id}`)
		}

		const error = new Error(`remote error (${msg.code}): ${msg.reason}`)

		this.#subs.delete(msg.id)

		const broadcast = this.#broadcasts.get(sub.broadcast)
		if (!broadcast) {
			throw new Error(`unknown broadcast: ${sub.broadcast}`)
		}

		if (sub.track == "catalog") {
			broadcast.catalog.reject(error)
		} else {
			// TODO pass the error to the consumer
			throw error
		}
	}

	async #subscribe(broadcast: string, track: string) {
		const id = this.#subsNext++
		this.#subs.set(id, { broadcast, track })

		await this.#sendControl({
			type: Control.Type.Subscribe,
			id,
			namespace: broadcast,
			name: track,
		})
	}

	async #sendControl(msg: Control.Message) {
		// Wait for the connection to be established.
		const control = await this.#conn.control

		console.log("sending message", msg)
		return control.send(msg)
	}

	async #onMessage(msg: Message.FromWorker) {
		if (msg.catalog) {
			await this.#onCatalog(msg.catalog)
		} else if (msg.timeline) {
			this.#onTimeline(msg.timeline)
		} else {
			throw new Error("unknown message from worker: " + msg)
		}
	}

	async #onCatalog(catalog: Message.Catalog) {
		const broadcast = this.#broadcasts.get(catalog.broadcast)
		if (!broadcast) {
			// Ignore unannounced broadcasts.
			return
		}

		broadcast.catalog.resolve(catalog)
	}

	#onTimeline(timeline: Message.Timeline) {
		// Save the latest timeline timeline
		this.#timeline = timeline
		this.#timelineNotify.broadcast()
	}

	close() {
		// TODO
	}

	// TODO support arguments
	play() {
		this.#port.sendPlay({ minBuffer: 0.5 }) // TODO
	}

	seek(timestamp: number) {
		this.#port.sendSeek({ timestamp })
	}

	async *timeline() {
		// Wait until connected, so we can throw any errors.
		await this.connected

		for (let i = 0; ; i += 1) {
			// Return the cached timeline if the epoch is large enough
			if (this.#timeline && this.#timeline.epoch >= i) {
				// Yield the updated timeline.
				yield this.#timeline
				i = this.#timeline.epoch
			} else if (this.#error) {
				throw this.#error
			} else {
				// Otherwise wait for the next update.
				await this.#timelineNotify.wait()
			}
		}
	}

	// Yields each time a new broadcast is announced
	async *broadcasts() {
		// Wait until connected, so we can throw any errors.
		await this.connected

		let skip = 0

		for (;;) {
			if (this.#error) {
				throw this.#error
			}

			// Yield all new entries in the map.
			let i = 0
			for (const broadcast of this.#broadcasts.entries()) {
				if (i < skip) {
					i += 1
					continue
				}

				yield new Broadcast(broadcast[1]) // wrap the broadcast to avoid exposing the inner object
				skip += 1
			}

			await this.#broadcastsNotify.wait()
		}
	}
}

export class Broadcast {
	#inner: BroadcastInner

	constructor(inner: BroadcastInner) {
		this.#inner = inner
	}

	async catalog(): Promise<Message.Catalog> {
		return await this.#inner.catalog.promise
	}

	get name(): string {
		return this.#inner.name
	}
}

class BroadcastInner {
	name: string
	catalog = new Deferred<Message.Catalog>()

	constructor(name: string) {
		this.name = name
	}
}

export class Track {}

interface Subscribe {
	broadcast: string
	track: string
}
