/// <reference types="vite/client" />

import * as Message from "./worker/message"
import MediaWorker from "./worker?worker"

export type Callback = (e: Message.FromWorker) => void

// This is a non-standard way of importing worklet/workers.
// Unfortunately, it's the only option because of a Vite bug: https://github.com/vitejs/vite/issues/11823

// Responsible for sending messages to the worker and worklet.
export class Port {
	// General worker
	#worker: Worker

	#callback: Callback

	constructor(callback: Callback) {
		this.#callback = callback

		// TODO does this block the main thread? If so, make this async
		// @ts-expect-error: The Vite typing is wrong https://github.com/vitejs/vite/blob/22bd67d70a1390daae19ca33d7de162140d533d6/packages/vite/client.d.ts#L182
		this.#worker = new MediaWorker({ format: "es" })
		this.#worker.addEventListener("message", this.on.bind(this))
	}

	// Just to enforce we're sending valid types to the worker
	private send(msg: Message.ToWorker, ...transfer: Transferable[]) {
		//console.log("sent message from main to worker", msg)
		this.#worker.postMessage(msg, transfer)
	}

	sendConfig(config: Message.Config) {
		const transfer = config.video ? [config.video.canvas] : []
		this.send({ config }, ...transfer)
	}

	sendInit(init: Message.Init) {
		this.send({ init }, init.stream)
	}

	sendSegment(segment: Message.Segment) {
		this.send({ segment }, segment.stream)
	}

	/*
	sendPlay(play: Message.Play) {
		this.send({ play })
	}

	sendSeek(seek: Message.Seek) {
		this.send({ seek })
	}
	*/

	private on(e: MessageEvent) {
		const msg = e.data as Message.FromWorker

		// Don't print the verbose timeline message.
		if (!msg.timeline) {
			//console.log("received message from worker to main", msg)
		}

		this.#callback(msg)
	}
}
