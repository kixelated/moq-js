import * as Timeline from "../timeline"
import * as Message from "./message"

import * as Audio from "../audio"
import * as Video from "../video"
import * as Stream from "../../stream"

import { Decoder } from "../decoder"

class Worker {
	// Decoder receives a QUIC stream, parsing the MP4 container
	decoder: Decoder

	// Timeline receives samples, buffering them and choosing the timestamp to render.
	timeline: Timeline.Sync

	// Renderer requests samples, rendering video frames and emitting audio frames.
	audio: Audio.Renderer
	video: Video.Renderer

	// Send buffer updates every so often
	infoEpoch: number
	infoInterval: number

	constructor(config: Message.Config) {
		this.timeline = new Timeline.Sync()

		// Add samples to the timeline as we decode them.
		this.decoder = new Decoder(this.timeline)

		// Render samples from the timeline as we receive them.
		this.audio = new Audio.Renderer(config.audio, this.timeline)
		this.video = new Video.Renderer(config.video, this.timeline)

		// Send updates every 100ms
		this.infoEpoch = 0
		this.infoInterval = setInterval(this.sendInfo.bind(this), 100)
	}

	on(e: MessageEvent) {
		const msg = e.data as Message.ToWorker

		if (msg.config) {
			throw new Error("tried to reconfigure worker")
		} else if (msg.segment) {
			const stream = msg.segment.stream
			const reader = new Stream.Reader(stream.reader, stream.buffer)
			this.decoder.receive(msg.segment.header, reader)
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
		postMessage(msg)
	}

	sendInfo() {
		// TODO support gaps
		const audio = this.timeline.audio.ranges()
		const video = this.timeline.video.ranges()

		// TODO send on each update, not at an interval
		const info: Message.Info = {
			epoch: this.infoEpoch++,
			audio,
			video,
		}

		const ref = this.timeline.sync(0)
		if (ref) {
			const now = performance.now() / 1000
			info.timestamp = now - ref
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
	self.addEventListener("message", worker.on.bind(worker))
}

self.addEventListener("message", setup)
