import * as Message from "./message"
import * as Stream from "../../stream"

// The main thread, responsible for sending messages to the worker and worklet.
export class Main {
	// General worker
	private worker: Worker

	constructor(config: Message.Config) {
		const url = new URL("worker.ts", import.meta.url)

		// TODO does this block the main thread? If so, make this async
		this.worker = new Worker(url, {
			type: "module",
			name: "media",
		})

		this.worker.addEventListener("message", this.on.bind(this))
		this.sendConfig(config)
	}

	// Just to enforce we're sending valid types to the worker
	private send(msg: Message.ToWorker, ...transfer: Transferable[]) {
		this.worker.postMessage(msg, transfer)
	}

	private sendConfig(config: Message.Config) {
		this.send({ config }, config.video.canvas)
	}

	sendInit(init: Stream.Buffer) {
		this.send({ init }, init.buffer.buffer, init.reader)
	}

	sendSegment(segment: Message.Segment) {
		this.send({ segment }, segment.buffer.buffer, segment.reader)
	}

	sendPlay(play: Message.Play) {
		this.send({ play })
	}

	private on(e: MessageEvent) {
		const msg = e.data as Message.FromWorker
		if (msg.info) this.onInfo(msg.info)
	}

	private onInfo(_info: Message.Info) {
		// TODO
	}
}
