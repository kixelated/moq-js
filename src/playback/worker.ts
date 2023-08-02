import { Timeline } from "./timeline"

import * as Audio from "./audio"
import * as Video from "./video"

import { Container } from "./container"
import * as Message from "./message"
import { asError } from "../common/error"

class Worker {
	// Timeline receives samples, buffering them and choosing the timestamp to render.
	#timeline = new Timeline()

	// A map of init tracks.
	#inits = new Map<string, ReadableStream<Uint8Array>>()

	// Renderer requests samples, rendering video frames and emitting audio frames.
	#audio?: Audio.Renderer
	#video?: Video.Renderer

	on(e: MessageEvent) {
		const msg = e.data as Message.ToWorker
		console.log("worker:", msg)

		if (msg.config) {
			this.#audio = new Audio.Renderer(msg.config.audio, this.#timeline.audio)
			this.#video = new Video.Renderer(msg.config.video, this.#timeline.video)
		} else if (msg.init) {
			this.onInit(msg.init)
		} else if (msg.segment) {
			this.onSegment(msg.segment).catch((e) => {
				const err = asError(e)
				send({ fail: { err } })
			})
		} else {
			throw new Error(`unknown message: + ${JSON.stringify(msg)}`)
		}
	}

	onInit(msg: Message.Init) {
		// NOTE: We don't buffer the init segments because I'm lazy.
		// Instead, we fork the reader on each segment so it gets a copy of the data.
		// This is mostly done because I'm lazy and don't want to create a promise.
		this.#inits.set(msg.name, msg.stream)
	}

	async onSegment(msg: Message.Segment) {
		const init = this.#inits.get(msg.init)
		if (!init) throw new Error(`unknown init track: ${msg.init}`)

		// Make a copy of the init stream
		// TODO: This could have performance ramifications?
		const [initFork, initClone] = init.tee()
		this.#inits.set(msg.init, initFork)

		// Create a new container that we will use to decode.
		const container = new Container()

		const timeline = msg.kind === "audio" ? this.#timeline.audio : this.#timeline.video

		// Add the segment to the timeline
		const segments = timeline.segments.getWriter()
		await segments.write({
			sequence: msg.header.sequence,
			frames: container.decode.readable,
		})
		segments.releaseLock()

		// Decode the init and then the segment itself
		// TODO avoid decoding the init every time.
		await initClone.pipeTo(container.decode.writable)
		await msg.stream.pipeTo(container.decode.writable)
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
