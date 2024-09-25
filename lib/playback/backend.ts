/// <reference types="vite/client" />

import * as Message from "./worker/message"
import { Root, isAudioTrack } from "../media/catalog"
import { GroupHeader } from "../transport/objects"
import { RingShared } from "../common/ring"
import type { Audio } from "./audio"

export interface PlayerConfig {
	canvas: OffscreenCanvas
	catalog: Root
}

// Responsible for sending messages to the worker and worklet.
export default class Backend {
	// General worker
	#worker: Worker

	// The audio context, which must be created on the main thread.
	#audio?: Audio

	constructor(config: PlayerConfig) {
		// TODO does this block the main thread? If so, make this async
		this.#worker = new Worker(new URL("worker/index.ts", import.meta.url), {
			type: "module",
			name: "media",
		})

		let sampleRate: number | undefined
		let channels: number | undefined

		for (const track of config.catalog.tracks) {
			if (isAudioTrack(track)) {
				if (sampleRate && track.selectionParams.samplerate !== sampleRate) {
					throw new Error(`TODO multiple audio tracks with different sample rates`)
				}
				sampleRate = track.selectionParams.samplerate
				// TODO properly handle weird channel configs
				channels = Math.max(+track.selectionParams.channelConfig, channels ?? 0)
			}
		}

		const msg: Message.Config = {}

		// Only configure audio is we have an audio track
		if (sampleRate && channels) {
			msg.audio = {
				channels: channels,
				sampleRate: sampleRate,
				ring: new RingShared(2, sampleRate / 10), // 100ms
			}
			this.loadAudio().then((module) => (this.#audio = new module.Audio(msg.audio as Message.ConfigAudio)))
		}

		// TODO only send the canvas if we have a video track
		msg.video = {
			canvas: config.canvas,
		}

		this.send({ config: msg }, msg.video.canvas)
	}

	async loadAudio(): Promise<typeof import("./audio")> {
		return await import("./audio")
	}

	async play() {
		await this.#audio?.context.resume()
	}

	init(init: Init) {
		this.send({ init })
	}

	segment(segment: Message.Segment) {
		this.send({ segment }, segment.stream)
	}

	async close() {
		this.#worker.terminate()
		await this.#audio?.context.close()
	}

	// Enforce we're sending valid types to the worker
	private send(msg: Message.ToWorker, ...transfer: Transferable[]) {
		this.#worker.postMessage(msg, transfer)
	}
}

export interface Init {
	name: string // name of the init track
	data: Uint8Array
}
