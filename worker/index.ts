import * as Timeline from "./timeline"

import * as Audio from "./audio"
import * as Video from "./video"

import { Decoder } from "./decoder"
import { Message } from "~/shared"

class Worker {
	// Decoder receives a QUIC stream, parsing the MP4 container
	decoder: Decoder

	// Timeline receives samples, buffering them and choosing the timestamp to render.
	timeline: Timeline.Sync

	// Renderer requests samples, rendering video frames and emitting audio frames.
	audio: Audio.Renderer
	video: Video.Renderer

	// Send buffer updates every so often
	timelineEpoch: number
	timelineInterval: number

	constructor(config: Message.Config) {
		this.timeline = new Timeline.Sync()

		// Add samples to the timeline as we decode them.
		this.decoder = new Decoder(this.timeline)

		// Render samples from the timeline as we receive them.
		this.audio = new Audio.Renderer(config.audio, this.timeline)
		this.video = new Video.Renderer(config.video, this.timeline)

		// Send updates every 100ms
		this.timelineEpoch = 0
		this.timelineInterval = setInterval(this.sendTimeline.bind(this), 100)

		this.#runInit()
	}

	// Send the init info when the decoder parses the catalog.
	async #runInit() {
		const info = await this.decoder.info()
		const init = { info }
		this.send({ init })
	}

	on(e: MessageEvent) {
		const msg = e.data as Message.ToWorker

		//console.log("received message to worker from main", msg)

		if (msg.config) {
			throw new Error("tried to reconfigure worker")
		} else if (msg.segment) {
			this.decoder.receive(msg.segment.header, msg.segment.stream)
		} else if (msg.play) {
			this.timeline.play(msg.play.minBuffer)
		} else if (msg.seek) {
			this.timeline.seek(msg.seek.timestamp)
		} else {
			throw new Error(`unknown message ${msg}`)
		}
	}

	// Mostly for type safety
	send(msg: Message.FromWorker) {
		// Don't print the verbose timeline message
		if (!msg.timeline) {
			//console.log("sent message from worker to main", msg)
		}

		postMessage(msg)
	}

	sendTimeline() {
		// TODO support gaps
		const audio = this.timeline.audio.ranges()
		const video = this.timeline.video.ranges()

		// TODO send on each update, not at an interval
		const timeline: Message.Timeline = {
			epoch: this.timelineEpoch++,
			audio: { buffer: audio },
			video: { buffer: video },
		}

		const ref = this.timeline.sync(0)
		if (ref) {
			const now = performance.now() / 1000
			timeline.timestamp = now - ref
		}

		this.send({ timeline })
	}
}

// The first message must be a Config message.
function setup(e: MessageEvent) {
	const msg = e.data as Message.ToWorker
	if (!msg.config) throw new Error("no config provided")

	self.removeEventListener("message", setup)

	// Pass all events to the worker from now on.
	const worker = new Worker(msg.config)
	self.addEventListener("message", worker.on.bind(worker))
}

self.addEventListener("message", setup)
