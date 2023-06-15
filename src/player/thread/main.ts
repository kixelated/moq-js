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
		this.#worker.postMessage(msg, transfer)
	}

	sendConfig(config: Message.Config) {
		this.send({ config }, config.video.canvas)
	}

	sendSegment(header: Data.Header, reader: Data.Reader) {
		const stream = reader.release()
		const segment: Message.Segment = { header, stream }

		this.send({ segment }, segment.stream.buffer.buffer, segment.stream.reader)
	}

	sendPlay(play: Message.Play) {
		this.send({ play })
	}

	sendSeek(seek: Message.Seek) {
		this.send({ seek })
	}

	private on(e: MessageEvent) {
		const msg = e.data as Message.FromWorker
		this.#callback(msg)
	}
}
