/// <reference types="vite/client" />

import { Ring, RingShared } from "../common/ring"
import { Component, Frame } from "./timeline"
import * as MP4 from "../media/mp4"

// This is a non-standard way of importing worklet/workers.
// Unfortunately, it's the only option because of a Vite bug: https://github.com/vitejs/vite/issues/11823
import workletURL from "./worklet?url"

export interface Config {
	channels: number
	sampleRate: number

	ring: RingShared
	timeline: Component
}

export class Renderer {
	#context: AudioContext
	#worklet: Promise<AudioWorkletNode>

	#ring: Ring
	#timeline: Component

	#decoder!: AudioDecoder
	#stream: TransformStream<Frame, AudioData>

	constructor(config: Config) {
		this.#context = new AudioContext({
			latencyHint: "interactive",
			sampleRate: config.sampleRate,
		})

		this.#worklet = this.load(config)

		this.#timeline = config.timeline
		this.#ring = new Ring(config.ring)

		this.#stream = new TransformStream({
			start: this.#start.bind(this),
			transform: this.#transform.bind(this),
		})

		this.#run().catch((err) => console.error("failed to run audio renderer: ", err))
	}

	private async load(config: Config): Promise<AudioWorkletNode> {
		// Load the worklet source code.
		await this.#context.audioWorklet.addModule(workletURL)

		const volume = this.#context.createGain()
		volume.gain.value = 2.0

		// Create the worklet
		const worklet = new AudioWorkletNode(this.#context, "renderer")

		worklet.port.addEventListener("message", this.on.bind(this))
		worklet.onprocessorerror = (e: Event) => {
			console.error("Audio worklet error:", e)
		}

		// Connect the worklet to the volume node and then to the speakers
		worklet.connect(volume)
		volume.connect(this.#context.destination)

		worklet.port.postMessage({ config })

		return worklet
	}

	private on(_event: MessageEvent) {
		// TODO
	}

	play() {
		this.#context.resume().catch((err) => console.warn("failed to resume audio context: ", err))
	}

	close() {
		this.#context.close().catch((err) => console.warn("failed to close audio context: ", err))
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
			timestamp: frame.sample.dts / frame.track.timescale,
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
			const written = this.#ring.write(frame)

			if (written < frame.numberOfFrames) {
				console.warn(`droppped ${frame.numberOfFrames - written} audio samples`)
			}
		}
	}
}
