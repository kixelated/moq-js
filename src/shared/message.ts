import { Info } from "../shared/mp4"

import { Object } from "../transport"
import * as Ring from "./ring"

export interface Config {
	audio: ConfigAudio
	video: ConfigVideo
}

export interface ConfigAudio {
	channels: number
	sampleRate: number

	ring: Ring.Init
}

export interface ConfigVideo {
	canvas: any // OffscreenCanvas
}

export interface Segment {
	broadcast: string

	header: Object.Header
	stream: ReadableStream
}

export interface Play {
	// Start playback once the minimum buffer size has been reached.
	minBuffer: number
}

export interface Seek {
	timestamp: number
}

// Sent by the worker when the catalog is parsed and the broadcast info is known.
export interface Catalog {
	// The name of the broadcast
	broadcast: string

	// The contents of the MP4 container
	info: Info
}

// Sent periodically with the current timeline info.
export interface Timeline {
	// The current playback position
	timestamp?: number

	// Audio specific information
	audio: TimelineAudio

	// Video specific information
	video: TimelineVideo
}

export interface TimelineAudio {
	buffer: Range[]
}

export interface TimelineVideo {
	buffer: Range[]
}

export interface Range {
	start: number
	end: number
}

// Used to validate that only the correct messages can be sent.

// Any top level messages that can be sent to the worker.
export interface ToWorker {
	// Sent to configure on startup.
	config?: Config

	// Sent on each init/data stream
	segment?: Segment

	// Sent to control playback
	play?: Play
	seek?: Seek
}

// Any top-level messages that can be sent from the worker.
export interface FromWorker {
	// Sent to the main thread after the catalog has been parsed
	catalog?: Catalog

	// Sent back to the main thread regularly to update the UI
	timeline?: Timeline
}

/*
interface ToWorklet {
	config?: Audio.Config
}

*/
