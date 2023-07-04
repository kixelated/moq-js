import { Timeline } from "./timeline"

import * as Audio from "./audio"
import * as Video from "./video"

import { decodeSegment } from "./decoder"
import * as Message from "./message"

class Worker {
	// Timeline receives samples, buffering them and choosing the timestamp to render.
	#timeline = new Timeline()

	// Renderer requests samples, rendering video frames and emitting audio frames.
	#audio?: Audio.Renderer
	#video?: Video.Renderer

	constructor() {
		this.#runTimeline() // async
	}

	async on(e: MessageEvent) {
		const msg = e.data as Message.ToWorker

		if (msg.config) {
			console.log("got config", msg.config)
			this.#audio = new Audio.Renderer(msg.config.audio, this.#timeline)
			this.#video = new Video.Renderer(msg.config.video, this.#timeline)
		} else if (msg.segment) {
			await this.onSegment(msg.segment)
		} else if (msg.play) {
			this.#timeline.play(msg.play.minBuffer)
		} else if (msg.seek) {
			this.#timeline.seek(msg.seek.timestamp)
		} else {
			throw new Error(`unknown message: + ${JSON.stringify(msg)}`)
		}
	}

	async onSegment(msg: Message.Segment) {
		const decode = decodeSegment(msg.init, msg.stream)
		for await (const frame of decode) {
			this.#timeline.push(frame)
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

// Pass all events to the worker
const worker = new Worker()
self.addEventListener("message", worker.on.bind(worker))

// Validates this is an expected message
function send(msg: Message.FromWorker) {
	postMessage(msg)
}
