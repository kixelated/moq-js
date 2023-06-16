import * as Audio from "./audio"
import * as Thread from "./thread"
import * as Timeline from "./timeline"
import * as MP4 from "../mp4"

import { Connection, Control } from "../transport"

import { Deferred } from "../util/deferred"

// This class must be created on the main thread due to AudioContext.
export class Player {
	#conn: Connection
	#context: Audio.Context
	#main: Thread.Main

	// The namespace as announced by the server
	#namespace?: string

	// The parsed catalog info
	#info?: MP4.Info

	// The most recent timeline message received from the worker.
	#timeline?: Timeline.State

	// A list of consumers waiting for the next timeline message by epoch.
	#timelineWaiting: Array<[number, Deferred<Timeline.State>]> = []

	constructor(conn: Connection, canvas: OffscreenCanvas) {
		// TODO refactor audio and video configuation
		const config = {
			audio: {
				channels: 2,
				sampleRate: 44100,
				ring: new Audio.Buffer(2, 44100),
			},
			video: {
				canvas,
			},
		}

		this.#context = new Audio.Context(config.audio)
		this.#main = new Thread.Main(this.#onMessage.bind(this)) // TODO await an async method instead
		this.#main.sendConfig(config)

		this.#conn = conn

		// Async
		this.#runData()
		this.#runControl()
	}

	async #runData() {
		const data = await this.#conn.data

		for (;;) {
			const next = await data.recv()
			if (!next) break

			const header = next[0]
			const stream = next[1]

			this.#main.sendSegment(header, stream)
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
			id: 0,
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

	async #onMessage(msg: Thread.FromWorker) {
		if (msg.init) {
			await this.#onInit(msg.init)
		} else if (msg.timeline) {
			this.#onTimeline(msg.timeline)
		} else {
			throw new Error("unknown message from worker: " + msg)
		}
	}

	async #onInit(init: Thread.Init) {
		this.#info = init.info

		// Subscribe to all of the listed tracks.
		// TODO support ABR
		for (const track of this.#info.tracks) {
			await this.#sendControl({
				type: Control.Type.Subscribe,
				id: track.id + 1, // 0 is reserved for the catalog
				namespace: this.#namespace!,
				name: track.id.toString(), // the track name is just the track ID as a string
			})
		}
	}

	#onTimeline(timeline: Thread.Timeline) {
		// Save the latest timeline timeline
		this.#timeline = {
			epoch: timeline.epoch,
			timestamp: timeline.timestamp,
			audio: {
				buffer: timeline.audio,
			},
			video: {
				buffer: timeline.video,
			},
		}

		// Loop through the array backwards, resolving any waiting consumers that meet the min epoch
		for (let i = this.#timelineWaiting.length - 1; i >= 0; i -= 1) {
			const waiting = this.#timelineWaiting[i]
			if (waiting[0] <= timeline.epoch) {
				waiting[1].resolve(this.#timeline)
				this.#timelineWaiting.splice(i, 1)
			}
		}
	}

	// TODO support arguments
	play() {
		this.#context.resume()
		this.#main.sendPlay({ minBuffer: 0.5 }) // TODO
	}

	seek(timestamp: number) {
		this.#main.sendSeek({ timestamp })
	}

	async timeline(minEpoch = 0): Promise<Timeline.State> {
		// Return the cached timeline if the epoch is large enough
		if (this.#timeline && this.#timeline.epoch >= minEpoch) return this.#timeline

		// Otherwise add ourselves to the waiting list.
		const deferred = new Deferred<Timeline.State>()
		this.#timelineWaiting.push([minEpoch, deferred])

		return deferred.promise
	}
}
