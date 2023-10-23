import { Frame, Timeline } from "./timeline"

import * as Audio from "./audio"
import * as Video from "./video"

import * as MP4 from "../../media/mp4"
import * as Message from "./message"
import { asError } from "../../common/error"

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

		if (msg.config) {
			this.#onConfig(msg.config)
		} else if (msg.init) {
			// TODO buffer the init segmnet so we don't hold the stream open.
			this.#onInit(msg.init)
		} else if (msg.segment) {
			const segment = msg.segment
			this.#onSegment(segment).catch(async (e) => {
				// Cancel the stream so we don't hold it open.
				const err = asError(e)
				await segment.stream.cancel(err)

				throw e
			})
		} else {
			throw new Error(`unknown message: + ${JSON.stringify(msg)}`)
		}
	}

	#onConfig(msg: Message.Config) {
		if (msg.audio) {
			this.#audio = new Audio.Renderer(msg.audio, this.#timeline.audio)
		}

		if (msg.video) {
			this.#video = new Video.Renderer(msg.video, this.#timeline.video)
		}
	}

	#onInit(msg: Message.Init) {
		// NOTE: We don't buffer the init segments because I'm lazy.
		// Instead, we fork the reader on each segment so it gets a copy of the data.
		// This is mostly done because I'm lazy and don't want to create a promise.
		this.#inits.set(msg.name, msg.stream)
	}

	async #onSegment(msg: Message.Segment) {
		const init = this.#inits.get(msg.init)
		if (!init) throw new Error(`unknown init track: ${msg.init}`)

		// Make a copy of the init stream
		// TODO: This could have performance ramifications?
		const [initFork, initClone] = init.tee()
		this.#inits.set(msg.init, initFork)

		// Create a new stream that we will use to decode.
		const container = new MP4.Parser()

		// Compute the timestamp for each frame.
		const frames = new TransformStream<[MP4.Track, MP4.Sample], Frame>({
			transform: (input, controller) => {
				const [track, sample] = input
				controller.enqueue({
					track,
					sample,
					// TODO don't convert to seconds for better accuracy
					timestamp: sample.dts / track.timescale,
				})
			},
		})

		const timeline = msg.kind === "audio" ? this.#timeline.audio : this.#timeline.video

		// Add the segment to the timeline
		const segments = timeline.segments.getWriter()
		await segments.write({
			sequence: msg.header.sequence,
			frames: frames.readable,
		})
		segments.releaseLock()

		// Decode the init and then the segment itself
		// TODO avoid decoding the init every time.
		await initClone.pipeTo(container.decode.writable, { preventClose: true })
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
		console.warn("worker error:", err)
	}
})

// Validates this is an expected message
function _send(msg: Message.FromWorker) {
	postMessage(msg)
}
