import * as Control from "./control"
import { Header, Objects } from "./object"
import { Queue, Watch } from "../common/async"
import { AnnounceSend, AnnounceRecv } from "./announce"

export class Subscribe {
	// Use to send control messages.
	#control: Control.Stream

	// Use to send objects.
	#objects: Objects

	// Our subscribed tracks.
	#send = new Map<bigint, SubscribeSend>()
	#sendNext = 0n

	// Their subscribed tracks.
	#recv = new Map<bigint, SubscribeRecv>()
	#recvQueue = new Queue<SubscribeRecv>()

	constructor(control: Control.Stream, objects: Objects) {
		this.#control = control
		this.#objects = objects
	}

	async send(name: string, announce: AnnounceRecv) {
		const id = this.#sendNext++

		const control = this.#control

		const subscribe = new SubscribeSend(control, id, announce, name)
		this.#send.set(id, subscribe)

		await control.send({
			type: Control.Type.Subscribe,
			id,
			namespace: announce.namespace,
			name,
		})

		return subscribe
	}

	// Receive the next new subscription
	async recv() {
		return this.#recvQueue.next()
	}

	async onSubscribe(msg: Control.Subscribe, announce: AnnounceSend) {
		if (this.#recv.has(msg.id)) {
			throw new Error(`duplicate subscribe for id: ${msg.id}`)
		}

		const subscribe = new SubscribeRecv(this.#control, this.#objects, msg.id, announce, msg.name)
		this.#recv.set(msg.id, subscribe)
		await this.#recvQueue.push(subscribe)

		await this.#control.send({ type: Control.Type.SubscribeOk, id: msg.id })
	}

	async onData(header: Header, stream: ReadableStream<Uint8Array>) {
		const subscribe = this.#send.get(header.track)
		if (!subscribe) {
			throw new Error(`data for for unknown track: ${header.track}`)
		} else {
			await subscribe.onData(header, stream)
		}
	}

	onOk(msg: Control.SubscribeOk) {
		const subscribe = this.#send.get(msg.id)
		if (!subscribe) {
			throw new Error(`subscribe ok for unknown id: ${msg.id}`)
		}

		subscribe.onOk()
	}

	async onError(msg: Control.SubscribeError) {
		const subscribe = this.#send.get(msg.id)
		if (!subscribe) {
			throw new Error(`subscribe error for unknown id: ${msg.id}`)
		}

		await subscribe.onError(msg.code, msg.reason)
	}
}

export class SubscribeRecv {
	#control: Control.Stream
	#objects: Objects
	#id: bigint

	readonly announce: AnnounceSend
	readonly name: string

	// The current state of the subscription.
	#state: "init" | "ack" | "closed" = "init"

	constructor(control: Control.Stream, objects: Objects, id: bigint, announce: AnnounceSend, name: string) {
		this.#control = control // so we can send messages
		this.#objects = objects // so we can send objects
		this.#id = id
		this.announce = announce
		this.name = name
	}

	// Acknowledge the subscription as valid.
	async ack() {
		if (this.#state !== "init") return
		this.#state = "ack"

		// Send the control message.
		return this.#control.send({ type: Control.Type.SubscribeOk, id: this.#id })
	}

	// Close the subscription with an error.
	async close(code = 0n, reason = "") {
		if (this.#state === "closed") return
		this.#state = "closed"

		return this.#control.send({ type: Control.Type.SubscribeError, id: this.#id, code, reason })
	}

	// Create a writable data stream
	async data(header: { group: bigint; sequence: bigint; send_order: number }) {
		return this.#objects.send({ track: this.#id, ...header })
	}
}

export class SubscribeSend {
	#control: Control.Stream

	readonly #id: bigint
	readonly announce: AnnounceRecv
	readonly name: string

	// The current state, updated by control messages.
	#state = new Watch<"init" | "ack" | Error>("init")

	// A queue of received streams for this subscription.
	#data = new Queue<{ header: Header; stream: ReadableStream<Uint8Array> }>()

	constructor(control: Control.Stream, id: bigint, announce: AnnounceRecv, name: string) {
		this.#control = control // so we can send messages
		this.#id = id
		this.announce = announce
		this.name = name
	}

	// Resolved when the remote sends an ok, rejected when the remote sends an error.
	async acked() {
		for (;;) {
			const [state, next] = this.#state.value()
			if (state === "ack") return
			if (state instanceof Error) throw state
			if (!next) throw new Error("closed")

			await next
		}
	}

	// Resolved when the subscription is closed.
	async active() {
		for (;;) {
			const [state, next] = this.#state.value()
			if (state instanceof Error) throw state
			if (!next) return

			await next
		}
	}

	closed() {
		const [state, next] = this.#state.value()
		return state instanceof Error || next == undefined
	}

	async close(code = 0n, reason = "") {
		if (this.closed()) {
			// Already closed
			return
		}

		// TODO implement unsubscribe
		// await this.#inner.sendReset(code, reason)

		if (reason !== "") {
			reason = `: ${reason}`
		}

		const err = new Error(`local error (${code})${reason}`)
		await this.#close(err)
	}

	onOk() {
		if (this.closed()) return
		this.#state.update("ack")
	}

	async onError(code: bigint, reason: string) {
		if (this.closed()) return

		if (reason !== "") {
			reason = `: ${reason}`
		}

		const err = new Error(`remote error (${code})${reason}`)
		await this.#close(err)
	}

	async onData(header: Header, stream: ReadableStream<Uint8Array>) {
		if (this.closed()) {
			// Cancel the stream immediately because we're closed
			await stream.cancel()
		} else {
			await this.#data.push({ header, stream })
		}
	}

	async #close(err: Error) {
		if (this.closed()) return

		await this.#data.close()

		for (;;) {
			const sub = await this.#data.next()
			if (!sub) break
			await sub.stream.cancel()
		}

		this.#state.update(err)
		this.#state.close()
	}

	// Receive the next a readable data stream
	async data() {
		return this.#data.next()
	}
}
