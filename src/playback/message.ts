import { Header } from "../transport/object"
import { RingShared } from "../common/ring"

export interface Config {
	audio: ConfigAudio
	video: ConfigVideo
}

export interface ConfigAudio {
	channels: number
	sampleRate: number

	ring: RingShared
}

export interface ConfigVideo {
	canvas: OffscreenCanvas
}

export interface Segment {
	init: Uint8Array
	header: Header
	stream: ReadableStream<Uint8Array>
}

export interface Play {
	// Start playback once the minimum buffer size has been reached.
	minBuffer: number
}

export interface Seek {
	timestamp: number
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
	// Sent back to the main thread regularly to update the UI
	timeline?: Timeline

	fail?: Fail
}

/*
interface ToWorklet {
	config?: Audio.Config
}

*/

export interface Fail {
	err: Error
}

export type Callback = (e: FromWorker) => void

// Responsible for sending messages to the worker and worklet.
export class Port {
	// General worker
	#worker: Worker

	#callback: Callback

	constructor(callback: Callback) {
		const url = new URL("worker.ts", import.meta.url)

		this.#callback = callback

		// TODO does this block the main thread? If so, make this async
		this.#worker = new Worker(url, {
			type: "module",
			name: "media",
		})

		this.#worker.addEventListener("message", this.on.bind(this))
	}

	// Just to enforce we're sending valid types to the worker
	private send(msg: ToWorker, ...transfer: Transferable[]) {
		//console.log("sent message from main to worker", msg)
		this.#worker.postMessage(msg, transfer)
	}

	sendConfig(config: Config) {
		this.send({ config }, config.video.canvas)
	}

	sendSegment(segment: Segment) {
		this.send({ segment }, segment.stream)
	}

	sendPlay(play: Play) {
		this.send({ play })
	}

	sendSeek(seek: Seek) {
		this.send({ seek })
	}

	private on(e: MessageEvent) {
		const msg = e.data as FromWorker

		// Don't print the verbose timeline message.
		if (!msg.timeline) {
			//console.log("received message from worker to main", msg)
		}

		this.#callback(msg)
	}
}
