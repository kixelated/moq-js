import * as Control from "./control"
import { Header, Objects } from "./object"
import { Queue } from "../common/async"

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
	#recvQueue = new Queue<SubscribeRecv>(Number.MAX_SAFE_INTEGER) // Unbounded queue in case there's no receiver

	constructor(control: Control.Stream, objects: Objects) {
		this.#control = control
		this.#objects = objects
	}

	async send(namespace: string, track: string) {
		const id = this.#sendNext++

		const subscribe = new SubscribeSend(this.#control, id, namespace, track)
		this.#send.set(id, subscribe)

		await this.#control.send({
			type: Control.Type.Subscribe,
			id,
			namespace,
			name: track,
		})

		return subscribe
	}

	// Receive the next new subscription
	async recv() {
		return this.#recvQueue.next()
	}

	async onSubscribe(msg: Control.Subscribe) {
		if (this.#recv.has(msg.id)) {
			throw new Error(`duplicate subscribe for id: ${msg.id}`)
		}

		const subscribe = new SubscribeRecv(this.#control, this.#objects, msg.id, msg.namespace, msg.name)
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

	readonly namespace: string
	readonly track: string

	// The current state of the subscription.
	#state: "init" | "ack" | "closed" = "init"

	constructor(control: Control.Stream, objects: Objects, id: bigint, namespace: string, track: string) {
		this.#control = control // so we can send messages
		this.#objects = objects // so we can send objects
		this.#id = id
		this.namespace = namespace
		this.track = track
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
	#id: bigint

	readonly namespace: string
	readonly track: string

	// A queue of received streams for this subscription.
	#data = new Queue<{ header: Header; stream: ReadableStream<Uint8Array> }>()

	constructor(control: Control.Stream, id: bigint, namespace: string, track: string) {
		this.#control = control // so we can send messages
		this.#id = id
		this.namespace = namespace
		this.track = track
	}

	async close(code = 0n, reason = "") {
		// TODO implement unsubscribe
		// await this.#inner.sendReset(code, reason)
	}

	onOk() {
		// noop
	}

	async onError(code: bigint, reason: string) {
		if (code == 0n) {
			return await this.#data.close()
		}

		if (reason !== "") {
			reason = `: ${reason}`
		}

		const err = new Error(`SUBSCRIBE_ERROR (${code})${reason}`)
		return await this.#data.abort(err)
	}

	async onData(header: Header, stream: ReadableStream<Uint8Array>) {
		if (!this.#data.closed()) await this.#data.push({ header, stream })
	}

	// Receive the next a readable data stream
	async data() {
		return this.#data.next()
	}
}
