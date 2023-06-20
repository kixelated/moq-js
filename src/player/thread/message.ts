import * as Audio from "../audio"
import * as Video from "../video"
import * as MP4 from "../../mp4"

import { Range } from "../timeline"
import { Data } from "../../transport"

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
	init?: Init

	// Sent back to the main thread regularly to update the UI
	timeline?: Timeline
}

export interface ToWorklet {
	config?: Audio.Config
}

export type FromWorklet = any

export interface Config {
	audio: Audio.Config
	video: Video.Config
}

export interface Segment {
	header: Data.Header
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
export interface Init {
	// The contents of the MP4 container
	info: MP4.Info
}

// Sent periodically with the current timeline info.
export interface Timeline {
	epoch: number // increases by 1 each update

	timestamp?: number
	audio: Range[]
	video: Range[]
}
