import { Timeline } from "./timeline"

import * as Audio from "./audio"
import * as Video from "./video"

import { decodeSegment } from "./container"
import * as Message from "./message"
import { asError } from "../common/error"

class Worker {
	// Timeline receives samples, buffering them and choosing the timestamp to render.
	#timeline = new Timeline()

	// Renderer requests samples, rendering video frames and emitting audio frames.
	#audio?: Audio.Renderer
	#video?: Video.Renderer

	on(e: MessageEvent) {
		const msg = e.data as Message.ToWorker

		if (msg.config) {
			this.#audio = new Audio.Renderer(msg.config.audio, this.#timeline)
			this.#video = new Video.Renderer(msg.config.video, this.#timeline)
		} else if (msg.segment) {
			this.onSegment(msg.segment).catch((e) => {
				const err = asError(e)
				send({ fail: { err } })
			})
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
			this.#sendTimeline()
		}
	}

	// TODO limit the frequency?
	#sendTimeline() {
		const audio = this.#timeline.audio.ranges()
		const video = this.#timeline.video.ranges()

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
	}
}

// Pass all events to the worker
const worker = new Worker()
self.addEventListener("message", (msg) => {
	try {
		worker.on(msg)
	} catch (e) {
		const err = asError(e)
		send({ fail: { err } })
	}
})

// Validates this is an expected message
function send(msg: Message.FromWorker) {
	postMessage(msg)
}
