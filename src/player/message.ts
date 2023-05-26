import * as Ring from "./renderer/ring"

export interface Config {
	// Video canvas to render
	canvas: OffscreenCanvas

	// Ring buffer used for the audio worklet
	ring: Ring.Buffer
}

export interface Init {
	buffer: Uint8Array // unread buffered data
	reader: ReadableStream // unread unbuffered data
}

export interface Segment {
	buffer: Uint8Array // unread buffered data
	reader: ReadableStream // unread unbuffered data
}

export interface Play {
	// Start playback once the minimum buffer size has been reached.
	minBuffer: number
}
