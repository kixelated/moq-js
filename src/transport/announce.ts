import * as Control from "./control"
import { Notify, Deferred } from "../common/async"
import { Subscribe } from "./subscribe"

// Handles all incoming and outgoing announce messages for a connection.
export class Announce {
	#control: Control.Stream
	#subscribe: Subscribe

	// Our announced tracks.
	#send = new Map<string, AnnounceSend>()

	// Their announced tracks.
	#recv = new Map<string, AnnounceRecv>()
	#recvQueue = new Array<AnnounceRecv>()
	#recvNotify = new Notify()

	constructor(control: Control.Stream, subscribe: Subscribe) {
		this.#control = control
		this.#subscribe = subscribe
	}

	// Announce a track namespace.
	async send(namespace: string) {
		if (this.#send.has(namespace)) {
			throw new Error(`already announced: ${namespace}`)
		}

		const announce = new AnnounceSend(this.#control, namespace)
		this.#send.set(namespace, announce)

		await this.#control.send({
			type: Control.Type.Announce,
			namespace,
		})

		return announce
	}

	// Receive a track namespace.
	async recv() {
		for (;;) {
			const next = this.#recvQueue.shift()
			if (next) return next

			// Wait for the next value
			await this.#recvNotify.wait()
		}
	}

	async onAnnounce(msg: Control.Announce) {
		if (this.#recv.has(msg.namespace)) {
			throw new Error(`duplicate announce for namespace: ${msg.namespace}`)
		}

		await this.#control.send({ type: Control.Type.AnnounceOk, namespace: msg.namespace })

		const announce = new AnnounceRecv(this.#control, this.#subscribe, msg.namespace)
		this.#recv.set(msg.namespace, announce)
		this.#recvQueue.push(announce)
		this.#recvNotify.broadcast()
	}

	onOk(msg: Control.AnnounceOk) {
		const announce = this.#send.get(msg.namespace)
		if (!announce) {
			throw new Error(`announce error for unknown announce: ${msg.namespace}`)
		}

		announce.onOk()
	}

	onError(msg: Control.AnnounceError) {
		const announce = this.#send.get(msg.namespace)
		if (!announce) {
			throw new Error(`announce error for unknown announce: ${msg.namespace}`)
		}

		announce.onError(msg.code, msg.reason)
	}

	// Got a subscribe message for a namespace we announced.
	async onSubscribe(msg: Control.Subscribe) {
		const announce = this.#send.get(msg.namespace)
		if (!announce) {
			throw new Error(`subscribe for unknown announce: ${msg.namespace}`)
		}

		await this.#subscribe.onSubscribe(msg, announce)
	}
}

export class AnnounceSend {
	#control: Control.Stream

	readonly namespace: string

	#ok = new Deferred()
	#active = new Deferred()

	constructor(control: Control.Stream, namespace: string) {
		this.#control = control
		this.namespace = namespace
	}

	get ok() {
		return this.#ok.promise
	}

	get error() {
		return this.#active.promise
	}

	async close(_code = 0n, _reason = "") {
		// TODO implement unsubscribe
		// await this.#inner.sendReset(code, reason)
	}

	onOk() {
		if (!this.#ok.pending) {
			throw new Error("or or error already received")
		}

		this.#ok.resolve(undefined)
	}

	onError(code: bigint, reason: string) {
		if (!this.#active.pending) {
			throw new Error("error already received")
		}

		const err = new Error(`ANNOUNCE_ERROR (${code})` + reason ? `: ${reason}` : "")
		this.#ok.reject(err)
		this.#active.reject(err)
	}
}

export class AnnounceRecv {
	#control: Control.Stream
	#subscribe: Subscribe

	readonly namespace: string

	okSent = false
	errSent = false

	constructor(control: Control.Stream, subscribe: Subscribe, namespace: string) {
		this.#control = control // so we can send messages
		this.#subscribe = subscribe // literally just for the subscribe() helper method
		this.namespace = namespace
	}

	// Acknowledge the subscription as valid.
	async ok() {
		if (this.okSent) {
			throw new Error("ok already sent")
		} else if (this.errSent) {
			throw new Error("err already sent")
		}

		this.okSent = true

		// Send the control message.
		await this.#control.send({ type: Control.Type.AnnounceOk, namespace: this.namespace })
	}

	async close(code = 0n, reason = "") {
		if (this.errSent) {
			throw new Error("error already sent")
		}

		this.errSent = true

		await this.#control.send({ type: Control.Type.AnnounceError, namespace: this.namespace, code, reason })
	}

	// Helper to subscribe to the received announced namespace.
	async subscribe(name: string) {
		return this.#subscribe.send(name, this)
	}
}
