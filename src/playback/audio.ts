import * as Message from "./message"
import { Ring } from "../common/ring"
import { Component } from "./timeline"

// NOTE: This must be on the main thread
export class Context {
	context: AudioContext
	worklet: Promise<AudioWorkletNode>

	constructor(config: Message.ConfigAudio) {
		this.context = new AudioContext({
			latencyHint: "interactive",
			sampleRate: config.sampleRate,
		})

		this.worklet = this.load(config)
	}

	private async load(config: Message.ConfigAudio): Promise<AudioWorkletNode> {
		// Load the worklet source code.
		const url = new URL("../worklet/index.ts", import.meta.url)
		await this.context.audioWorklet.addModule(url)

		const volume = this.context.createGain()
		volume.gain.value = 2.0

		// Create the worklet
		const worklet = new AudioWorkletNode(this.context, "renderer")

		worklet.port.addEventListener("message", this.on.bind(this))
		worklet.onprocessorerror = (e: Event) => {
			console.error("Audio worklet error:", e)
		}

		// Connect the worklet to the volume node and then to the speakers
		worklet.connect(volume)
		volume.connect(this.context.destination)

		worklet.port.postMessage({ config })

		return worklet
	}

	private on(_event: MessageEvent) {
		// TODO
	}

	async resume() {
		await this.context.resume()
	}
}

// This is run in a worker.
export class Renderer {
	ring?: Ring
	timeline: Component

	queue: AudioData[]
	interval?: number
	last?: number // the timestamp of the last rendered frame, in microseconds

	constructor(config: Message.ConfigAudio, timeline: Component) {
		this.timeline = timeline
		this.queue = []
	}

	render(frame: AudioData) {
		// Drop any old frames
		if (this.last && frame.timestamp <= this.last) {
			frame.close()
			return
		}

		// Insert the frame into the queue sorted by timestamp.
		if (this.queue.length > 0 && this.queue[this.queue.length - 1].timestamp <= frame.timestamp) {
			// Fast path because we normally append to the end.
			this.queue.push(frame)
		} else {
			// Do a full binary search
			let low = 0
			let high = this.queue.length

			while (low < high) {
				const mid = (low + high) >>> 1
				if (this.queue[mid].timestamp < frame.timestamp) low = mid + 1
				else high = mid
			}

			this.queue.splice(low, 0, frame)
		}

		this.emit()
	}

	emit() {
		const ring = this.ring
		if (!ring) {
			return
		}

		while (this.queue.length) {
			const frame = this.queue[0]
			if (ring.size() + frame.numberOfFrames > ring.capacity) {
				// Buffer is full
				break
			}

			const size = ring.write(frame)
			if (size < frame.numberOfFrames) {
				throw new Error("audio buffer is full")
			}

			this.last = frame.timestamp

			frame.close()
			this.queue.shift()
		}
	}
}
