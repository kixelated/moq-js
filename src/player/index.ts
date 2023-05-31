import * as Audio from "./audio"
import * as Thread from "./thread"
import * as Transport from "../transport"

// This class must be created on the main thread due to AudioContext.
export class Player {
	connection: Transport.Connection
	context: Audio.Context
	main: Thread.Main

	constructor(connection: Transport.Connection, canvas: OffscreenCanvas) {
		// TODO refactor audio and video configuation
		const config = {
			audio: {
				channels: 2,
				sampleRate: 44100,
				ring: new Audio.Buffer(2, 44100),
			},
			video: {
				canvas,
			},
		}

		this.context = new Audio.Context(config.audio)
		this.main = new Thread.Main(config)

		this.connection = connection
		this.connection.callback = this
	}

	// An init stream was received over the network.
	onInit(stream: Transport.Stream) {
		this.main.sendInit(stream)
	}

	// A segment stream was received over the network.
	onSegment(stream: Transport.Stream) {
		this.main.sendSegment(stream)
	}

	// TODO support arguments
	play() {
		this.context.resume()
		this.main.sendPlay({ minBuffer: 0.2 }) // TODO
	}
}
