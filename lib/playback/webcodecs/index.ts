/// <reference types="vite/client" />

import * as Message from "./message"
import { Context } from "./context"

import { Start, Segment, Init } from "../../playback/message"

import MediaWorker from "./worker?worker"
import { RingShared } from "../../common/ring"
import { isAudioTrack } from "../../media/catalog"

export interface PlayerConfig {
	element: HTMLCanvasElement
}

// This is a non-standard way of importing worklet/workers.
// Unfortunately, it's the only option because of a Vite bug: https://github.com/vitejs/vite/issues/11823

// Responsible for sending messages to the worker and worklet.
export default class Player {
	// General worker
	#worker: Worker

	// The audio context, which must be created on the main thread.
	#context?: Context

	#element: OffscreenCanvas

	constructor(config: PlayerConfig) {
		this.#element = config.element.transferControlToOffscreen()

		// TODO does this block the main thread? If so, make this async
		// @ts-expect-error: The Vite typing is wrong https://github.com/vitejs/vite/blob/22bd67d70a1390daae19ca33d7de162140d533d6/packages/vite/client.d.ts#L182
		this.#worker = new MediaWorker({ format: "es" })
		this.#worker.addEventListener("message", this.on.bind(this))
	}

	start(msg: Start) {
		let sampleRate: number | undefined
		let channels: number | undefined

		for (const track of msg.catalog.tracks) {
			if (isAudioTrack(track)) {
				if (sampleRate && track.sample_rate !== sampleRate) {
					throw new Error(`TODO multiple audio tracks with different sample rates`)
				}

				sampleRate = track.sample_rate
				channels = Math.max(track.channel_count, channels ?? 0)
			}
		}

		const config: Message.Config = {}

		// Only configure audio is we have an audio track
		if (sampleRate && channels) {
			config.audio = {
				channels: channels,
				sampleRate: sampleRate,
				ring: new RingShared(2, sampleRate / 20), // 50ms
			}

			this.#context = new Context(config.audio)
		}

		// TODO only send the canvas if we have a video track
		config.video = {
			canvas: this.#element,
		}

		this.send({ config }, config.video.canvas)
	}

	// TODO initialize context now
	play() {}

	init(init: Init) {
		this.send({ init }, init.stream)
	}

	segment(segment: Segment) {
		this.send({ segment }, segment.stream)
	}

	// Enforce we're sending valid types to the worker
	private send(msg: Message.ToWorker, ...transfer: Transferable[]) {
		//console.log("sent message from main to worker", msg)
		this.#worker.postMessage(msg, transfer)
	}

	private on(e: MessageEvent) {
		const msg = e.data as Message.FromWorker

		// Don't print the verbose timeline message.
		if (!msg.timeline) {
			//console.log("received message from worker to main", msg)
		}
	}
}
