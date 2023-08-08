import * as Message from "./message"
import { Ring } from "../common/ring"
import { Component, Frame } from "./timeline"
import * as MP4 from "../common/mp4"

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
	#ring: Ring
	#timeline: Component

	#decoder!: AudioDecoder
	#stream: TransformStream<Frame, AudioData>

	constructor(config: Message.ConfigAudio, timeline: Component) {
		this.#timeline = timeline
		this.#ring = new Ring(config.ring)

		this.#stream = new TransformStream({
			start: this.#start.bind(this),
			transform: this.#transform.bind(this),
		})

		this.#run().catch(console.error)
	}

	#start(controller: TransformStreamDefaultController) {
		this.#decoder = new AudioDecoder({
			output: (frame: AudioData) => {
				controller.enqueue(frame)
			},
			error: console.warn,
		})
	}

	#transform(frame: Frame) {
		if (this.#decoder.state !== "configured") {
			const track = frame.track
			if (!MP4.isAudioTrack(track)) throw new Error("expected audio track")

			// We only support OPUS right now which doesn't need a description.
			this.#decoder.configure({
				codec: track.codec,
				sampleRate: track.audio.sample_rate,
				numberOfChannels: track.audio.channel_count,
			})
		}

		const chunk = new EncodedAudioChunk({
			type: frame.sample.is_sync ? "key" : "delta",
			timestamp: frame.timestamp,
			duration: frame.sample.duration,
			data: frame.sample.data,
		})

		this.#decoder.decode(chunk)
	}

	async #run() {
		const reader = this.#timeline.frames.pipeThrough(this.#stream).getReader()

		for (;;) {
			const { value: frame, done } = await reader.read()
			if (done) break

			// Write audio samples to the ring buffer, dropping when there's no space.
			this.#ring.write(frame)
		}
	}
}
