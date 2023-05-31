import * as Timeline from "../timeline"
import * as Message from "./message"

import * as Audio from "../audio"
import * as Video from "../video"

import { Decoder } from "../decoder"

class Worker {
	// Decoder receives a QUIC stream, parsing the MP4 container
	decoder: Decoder

	// Timeline receives samples, buffering them and choosing the timestamp to render.
	timeline: Timeline.Sync

	// Renderer requests samples, rendering video frames and emitting audio frames.
	audio: Audio.Renderer
	video: Video.Renderer

	constructor(config: Message.Config) {
		this.timeline = new Timeline.Sync()

		// Add samples to the timeline as we decode them.
		this.decoder = new Decoder(this.timeline)

		// Render samples from the timeline as we receive them.
		this.audio = new Audio.Renderer(config.audio, this.timeline.audio)
		this.video = new Video.Renderer(config.video, this.timeline.video)
	}

	on(e: MessageEvent) {
		const msg = e as Message.ToWorker

		if (msg.config) {
			throw new Error("tried to reconfigure worker")
		} else if (msg.init) {
			this.decoder.init(msg.init)
		} else if (msg.segment) {
			this.decoder.segment(msg.segment)
		} else if (msg.play) {
			this.timeline.play(msg.play.minBuffer)
		}
	}

	// Mostly for type safety
	send(msg: Message.FromWorker, ...transfer: Transferable[]) {
		self.postMessage(msg, "", transfer)
	}

	sendInfo() {
		// TODO support gaps
		const audio = this.timeline.audio.span()
		const video = this.timeline.video.span()

		const info = {
			buffer: {
				audio,
				video,
			},
		}

		this.send({ info })
	}
}

// The first message must be a Config message.
function setup(e: MessageEvent) {
	const msg = e.data as Message.ToWorker
	if (!msg.config) throw new Error("no config provided")

	self.removeEventListener("message", setup)

	// Pass all events to the worker from now on.
	const worker = new Worker(msg.config)
	self.addEventListener("message", worker.on)
}

self.addEventListener("message", setup)
