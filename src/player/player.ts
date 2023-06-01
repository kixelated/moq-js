import * as Audio from "./audio"
import * as Thread from "./thread"
import * as Transport from "../transport"

import { Deferred } from "../util/deferred"
import { Info } from "./info"

// This class must be created on the main thread due to AudioContext.
export class Player {
	connection: Transport.Connection
	context: Audio.Context
	main: Thread.Main

	// The most recent info message received from the worker.
	#info?: Info

	// A list of consumers waiting for the next info message by epoch.
	#infoWaiting: Array<[number, Deferred<Info>]> = []

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
		this.main = new Thread.Main(this.#onMessage.bind(this))
		this.main.sendConfig(config)

		// TODO fix this API
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

	#onMessage(msg: Thread.FromWorker) {
		// TODO
		if (msg.info) {
			this.#onInfo(msg.info)
		}
	}

	#onInfo(info: Thread.Info) {
		// Save the latest info array
		this.#info = {
			epoch: info.epoch,
			timestamp: info.timestamp,
			audio: {
				buffer: info.audio,
			},
			video: {
				buffer: info.video,
			},
		}

		// Loop through the array backwards, resolving any waiting consumers that meet the min epoch
		for (let i = this.#infoWaiting.length - 1; i >= 0; i -= 1) {
			const waiting = this.#infoWaiting[i]
			if (waiting[0] <= info.epoch) {
				waiting[1].resolve(this.#info)
				this.#infoWaiting.splice(i, 1)
			}
		}
	}

	// TODO support arguments
	play() {
		this.context.resume()
		this.main.sendPlay({ minBuffer: 0.5 }) // TODO
	}

	seek(timestamp: number) {
		this.main.sendSeek({ timestamp })
	}

	async info(minEpoch = 0): Promise<Info> {
		// Return the cached info if the epoch is large enough
		if (this.#info && this.#info.epoch >= minEpoch) return this.#info

		// Otherwise add ourselves to the waiting list.
		const deferred = new Deferred<Info>()
		this.#infoWaiting.push([minEpoch, deferred])
		return deferred.promise
	}
}
