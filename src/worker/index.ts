import * as Timeline from "./timeline"

import * as Audio from "./audio"
import * as Video from "./video"

import { Decoder } from "./decoder"
import * as Message from "../shared/message"

class Worker {
	// A map of known broadcasts.
	#broadcasts = new Map<string, Broadcast>()

	// Timeline receives samples, buffering them and choosing the timestamp to render.
	#timeline = new Timeline.Sync()

	// Renderer requests samples, rendering video frames and emitting audio frames.
	#audio?: Audio.Renderer
	#video?: Video.Renderer

	constructor() {
		this.#runTimeline() // async
	}

	on(e: MessageEvent) {
		const msg = e.data as Message.ToWorker

		if (msg.config) {
			console.log("got config", msg.config)
			this.#audio = new Audio.Renderer(msg.config.audio, this.#timeline)
			this.#video = new Video.Renderer(msg.config.video, this.#timeline)
		} else if (msg.segment) {
			const name = msg.segment.broadcast
			let broadcast = this.#broadcasts.get(name)
			if (!broadcast) {
				broadcast = new Broadcast(name, this.#timeline)
				this.#broadcasts.set(name, broadcast)
			}

			broadcast.decoder.receive(msg.segment.header, msg.segment.stream)
		} else if (msg.play) {
			this.#timeline.play(msg.play.minBuffer)
		} else if (msg.seek) {
			this.#timeline.seek(msg.seek.timestamp)
		} else {
			throw new Error(`unknown message: + ${JSON.stringify(msg)}`)
		}
	}

	async #runTimeline() {
		for (;;) {
			// TODO support gaps
			const audio = this.#timeline.audio.ranges()
			const video = this.#timeline.video.ranges()

			// TODO send on each update, not at an interval
			const timeline: Message.Timeline = {
				audio: { buffer: audio },
				video: { buffer: video },
			}

			const ref = this.#timeline.sync(0)
			if (ref) {
				const now = performance.now() / 1000
				timeline.timestamp = now - ref
			}

			send({ timeline })

			// Send every 100ms
			// TODO send when the timeline changes
			await new Promise((resolve) => setTimeout(resolve, 100))
		}
	}
}

class Broadcast {
	name: string
	decoder: Decoder

	constructor(name: string, timeline: Timeline.Sync) {
		this.name = name
		this.decoder = new Decoder(timeline)

		this.#runCatalog() // async
	}

	// Wait until the catalog is available and send it to the main thread.
	async #runCatalog() {
		const info = await this.decoder.info()
		send({ catalog: { broadcast: this.name, info } })
	}
}

// Pass all events to the worker
const worker = new Worker()
self.addEventListener("message", worker.on.bind(worker))

// Validates this is an expected message
function send(msg: Message.FromWorker) {
	postMessage(msg)
}
