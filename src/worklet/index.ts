import { Buffer } from "../shared/ring"
import * as Message from "../shared/message"

class Renderer extends AudioWorkletProcessor {
	ring?: Buffer
	base: number

	constructor() {
		// The super constructor call is required.
		super()

		this.base = 0
		this.port.onmessage = this.onMessage.bind(this)
	}

	onConfig(config: Message.ConfigAudio) {
		this.ring = new Buffer(config.ring)
	}

	onMessage(e: MessageEvent) {
		if (e.data.config) {
			this.onConfig(e.data.config)
		}
	}

	// Inputs and outputs in groups of 128 samples.
	process(inputs: Float32Array[][], outputs: Float32Array[][], _parameters: Record<string, Float32Array>): boolean {
		if (!this.ring) {
			// Paused
			return true
		}

		if (inputs.length != 1 && outputs.length != 1) {
			throw new Error("only a single track is supported")
		}

		const output = outputs[0]

		const size = this.ring.read(output)
		if (size < output.length) {
			// TODO trigger rebuffering event
		}

		return true
	}
}

registerProcessor("renderer", Renderer)
