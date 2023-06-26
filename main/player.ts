import * as Audio from "./audio"
import { Port } from "./port"

import { Connection, Control } from "~/transport"
import { Async, Message, Ring, MP4 } from "~/shared"

// This class must be created on the main thread due to AudioContext.
export class Player {
	#conn: Connection
	#context: Audio.Context
	#port: Port

	// The namespace as announced by the server
	#namespace?: string

	// The parsed catalog info
	#info?: MP4.Info

	// The most recent timeline message received from the worker.
	#timeline?: Message.Timeline

	// A list of consumers waiting for the next timeline message.
	#timelineNotify: Async.Notify = new Async.Notify()

	constructor(conn: Connection, canvas: OffscreenCanvas) {
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

		this.#context = new Audio.Context(config.audio)
		this.#port = new Port(this.#onMessage.bind(this)) // TODO await an async method instead
		this.#port.sendConfig(config)

		this.#conn = conn

		// Async
		this.#runObjects()
		this.#runControl()
	}

	async #runObjects() {
		const objects = await this.#conn.objects

		for (;;) {
			const next = await objects.recv()
			if (!next) break

			const header = next[0]
			const stream = next[1]

			this.#port.sendSegment(header, stream)
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
				return // cool i guess
			case Control.Type.SubscribeError:
				throw new Error(`failed to subscribe: ${msg.reason} (${msg.code})`)
			default:
				throw new Error(`unknown message type: ${msg.type}`)
		}
	}

	async #receiveAnnounce(msg: Control.Announce) {
		if (this.#namespace) {
			throw new Error("multiple ANNOUNCE messages received")
		}

		this.#namespace = msg.namespace

		// Immediately subscribe to announced namespaces.
		return this.#sendControl({
			type: Control.Type.Subscribe,
			id: 0n,
			namespace: this.#namespace,
			name: "catalog",
		})
	}

	async #sendControl(msg: Control.Message) {
		// Wait for the connection to be established.
		const control = await this.#conn.control

		console.log("sending message", msg)
		return control.send(msg)
	}

	async #onMessage(msg: Message.FromWorker) {
		if (msg.init) {
			await this.#onInit(msg.init)
		} else if (msg.timeline) {
			this.#onTimeline(msg.timeline)
		} else {
			throw new Error("unknown message from worker: " + msg)
		}
	}

	async #onInit(init: Message.Init) {
		this.#info = init.info

		// Subscribe to all of the listed tracks.
		// TODO support ABR
		for (const track of this.#info.tracks) {
			const subscribe_id = BigInt(track.id + 1)

			await this.#sendControl({
				type: Control.Type.Subscribe,
				id: subscribe_id,
				namespace: this.#namespace!,
				name: track.id.toString(), // the track name is just the track ID as a string
			})
		}
	}

	#onTimeline(timeline: Message.Timeline) {
		// Save the latest timeline timeline
		this.#timeline = timeline
		this.#timelineNotify.broadcast()
	}

	// TODO support arguments
	play() {
		this.#context.resume()
		this.#port.sendPlay({ minBuffer: 0.5 }) // TODO
	}

	seek(timestamp: number) {
		this.#port.sendSeek({ timestamp })
	}

	async timeline(minEpoch = 0): Promise<Message.Timeline> {
		for (;;) {
			// Return the cached timeline if the epoch is large enough
			if (this.#timeline && this.#timeline.epoch >= minEpoch) {
				return this.#timeline
			}

			// Otherwise wait for the next update.
			await this.#timelineNotify.wait()
		}
	}
}
