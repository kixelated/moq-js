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
			this.#audio = new Audio.Renderer(msg.config.audio, this.#timeline.audio)
			this.#video = new Video.Renderer(msg.config.video, this.#timeline.video)
		} else if (msg.segment) {
			this.onSegment(msg.segment).catch((e) => {
				const err = asError(e)
				send({ fail: { err } })
			})
		} else {
			throw new Error(`unknown message: + ${JSON.stringify(msg)}`)
		}
	}

	async onSegment(msg: Message.Segment) {
		const frames = msg.stream.pipeThrough(decodeSegment(msg.init))
		const timeline = msg.component === "audio" ? this.#timeline.audio : this.#timeline.video

		const segments = timeline.segments.getWriter()
		await segments.write({
			sequence: msg.header.sequence,
			frames,
		})
		segments.releaseLock()
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
