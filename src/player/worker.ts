import Renderer from "./renderer"
import Timeline from "./timeline"
import Decoder from "./decoder"

import * as Message from "./message"

// Decoder receives a QUIC stream, parsing the MP4 container
let decoder: Decoder

// Timeline receives samples, buffering them and choosing when to render.
let timeline: Timeline

// Renderer receives samples, rendering video frames and emitting audio frames at the provided time.
let renderer: Renderer

self.addEventListener("message", async (e: MessageEvent) => {
	if (e.data.config) {
		const config = e.data.config as Message.Config

		renderer = new Renderer(config)
		timeline = new Timeline(renderer)
		decoder = new Decoder(timeline)
	} else if (e.data.init) {
		const init = e.data.init as Message.Init
		await decoder.init(init)
	} else if (e.data.segment) {
		const segment = e.data.segment as Message.Segment
		await decoder.segment(segment)
	} else if (e.data.play) {
		const play = e.data.play as Message.Play
		await timeline.play(play)
	}
})
