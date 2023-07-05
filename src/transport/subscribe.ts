import * as Control from "./control"
import { Header, Objects } from "./object"
import { Notify, Deferred } from "../common/async"
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
	#recvQueue = new Array<SubscribeRecv>()
	#recvNotify = new Notify()

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
		for (;;) {
			const next = this.#recvQueue.shift()
			if (next) return next

			// Wait for any changes
			await this.#recvNotify.wait()
		}
	}

	async onSubscribe(msg: Control.Subscribe, announce: AnnounceSend) {
		if (this.#recv.has(msg.id)) {
			throw new Error(`duplicate subscribe for id: ${msg.id}`)
		}

		const subscribe = new SubscribeRecv(this.#control, this.#objects, msg.id, announce, msg.name)
		this.#recv.set(msg.id, subscribe)
		this.#recvQueue.push(subscribe)
		this.#recvNotify.broadcast()

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

	// Ok is resolved when the subscribe is acknowledged by the remote.
	#ok = new Deferred()

	// Active is resolved when the subscribe is cancelled.
	#active = new Deferred()

	constructor(control: Control.Stream, objects: Objects, id: bigint, announce: AnnounceSend, name: string) {
		this.#control = control // so we can send messages
		this.#objects = objects // so we can send objects
		this.#id = id
		this.announce = announce
		this.name = name
	}

	// Acknowledge the subscription as valid.
	async ack() {
		// Resolve the promise so we can use it as a boolean
		if (!this.#ok.pending) {
			throw new Error("ok or error already sent")
		}

		this.#ok.resolve(undefined)

		// Send the control message.
		await this.#control.send({ type: Control.Type.SubscribeOk, id: this.#id })
	}

	get acked() {
		return !this.#ok.pending
	}

	// Close the subscription with an error.
	async close(code = 0n, reason = "") {
		if (!this.#active.pending) {
			// Already closed
			return
		}

		const err = new Error(`SUBSCRIBE_ERROR (${code})` + reason ? `: ${reason}` : "")
		this.#ok.reject(err)
		this.#active.reject(err)

		await this.#control.send({ type: Control.Type.SubscribeError, id: this.#id, code, reason })
	}

	get closed() {
		return !this.#active.pending
	}

	// Create a writable data stream
	async data(header: { group: bigint; sequence: bigint; send_order: bigint }) {
		return await this.#objects.send({ track: this.#id, ...header })
	}
}

export class SubscribeSend {
	#control: Control.Stream

	readonly #id: bigint
	readonly announce: AnnounceRecv
	readonly name: string

	// Ok is resolved when the subscribe is acknowledged by the remote.
	#ok = new Deferred()

	// Active is resolved when the subscribe is cancelled.
	#active = new Deferred()

	// A queue of received streams for this subscription.
	#data = new Array<{ header: Header; stream: ReadableStream<Uint8Array> }>()
	#dataNotify = new Notify()

	constructor(control: Control.Stream, id: bigint, announce: AnnounceRecv, name: string) {
		this.#control = control // so we can send messages
		this.#id = id
		this.announce = announce
		this.name = name
	}

	// Resolved when the remote sends an ok, rejected when the remote sends an error.
	get ack() {
		return this.#ok.promise
	}

	get acked() {
		return !this.#ok.pending
	}

	// Rejected when the remote sends an error.
	get error() {
		return this.#active.promise
	}

	get closed() {
		return !this.#active.pending
	}

	async close(code = 0n, reason = "") {
		if (this.closed) {
			// Already closed
			return
		}

		// TODO implement unsubscribe
		// await this.#inner.sendReset(code, reason)

		if (reason !== "") {
			reason = `: ${reason}`
		}

		// We closed the subscription, so don't error
		this.#active.resolve(undefined)

		const err = new Error(`local error (${code})${reason}`)
		await this.#close(err)
	}

	onOk() {
		if (this.closed) {
			// Already closed
			return
		}

		this.#ok.resolve(undefined)
	}

	async onError(code: bigint, reason: string) {
		if (this.closed) {
			// Already closed
			return
		}

		if (reason !== "") {
			reason = `: ${reason}`
		}

		const err = new Error(`remote error (${code})${reason}`)
		await this.#close(err)
	}

	async onData(header: Header, stream: ReadableStream<Uint8Array>) {
		if (this.closed) {
			// Cancel the stream immediately because we're closed
			await stream.cancel()
		} else {
			this.#data.push({ header, stream })
			this.#dataNotify.broadcast()
		}
	}

	async #close(err: Error) {
		if (this.closed) {
			// Already closed
			return
		}

		this.#ok.reject(err)
		this.#active.reject(err)
		this.#dataNotify.close(err)

		for (const { stream } of this.#data) {
			await stream.cancel()
		}

		this.#data = []
	}

	// Receive the next a readable data stream
	async data() {
		for (;;) {
			const data = this.#data.shift()
			if (data) return data

			await this.#dataNotify.wait()
		}
	}
}
