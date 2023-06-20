import * as Message from "./message"
import { Data } from "../../transport"

export type Callback = (e: Message.FromWorker) => void

// The main thread, responsible for sending messages to the worker and worklet.
export class Main {
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
	private send(msg: Message.ToWorker, ...transfer: Transferable[]) {
		//console.log("sent message from main to worker", msg)
		this.#worker.postMessage(msg, transfer)
	}

	sendConfig(config: Message.Config) {
		this.send({ config }, config.video.canvas)
	}

	sendSegment(header: Data.Header, stream: ReadableStream) {
		const segment: Message.Segment = { header, stream }
		const reader = segment.stream.getReader({ mode: "byob" })
		reader.releaseLock()

		this.send({ segment }, segment.stream)
	}

	sendPlay(play: Message.Play) {
		this.send({ play })
	}

	sendSeek(seek: Message.Seek) {
		this.send({ seek })
	}

	private on(e: MessageEvent) {
		const msg = e.data as Message.FromWorker

		// Don't print the verbose timeline message.
		if (!msg.timeline) {
			//console.log("received message from worker to main", msg)
		}

		this.#callback(msg)
	}
}
