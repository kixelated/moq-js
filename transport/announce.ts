import * as Control from "./control"
import { Queue, Watch } from "../common/async"
import { Subscribe } from "./subscribe"

// Handles all incoming and outgoing announce messages for a connection.
export class Announce {
	#control: Control.Stream
	#subscribe: Subscribe

	// Our announced tracks.
	#send = new Map<string, AnnounceSend>()

	// Their announced tracks.
	#recv = new Map<string, AnnounceRecv>()
	#recvQueue = new Queue<AnnounceRecv>(Number.MAX_SAFE_INTEGER) // unbounded queue in case there's no receiver

	constructor(control: Control.Stream, subscribe: Subscribe) {
		this.#control = control
		this.#subscribe = subscribe
	}

	// Announce a track namespace.
	async send(namespace: string): Promise<AnnounceSend> {
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
	async recv(): Promise<AnnounceRecv | undefined> {
		return this.#recvQueue.next()
	}

	async onAnnounce(msg: Control.Announce) {
		if (this.#recv.has(msg.namespace)) {
			throw new Error(`duplicate announce for namespace: ${msg.namespace}`)
		}

		await this.#control.send({ type: Control.Type.AnnounceOk, namespace: msg.namespace })

		const announce = new AnnounceRecv(this.#control, this.#subscribe, msg.namespace)
		this.#recv.set(msg.namespace, announce)

		await this.#recvQueue.push(announce)
	}

	onOk(msg: Control.AnnounceOk) {
		const announce = this.#send.get(msg.namespace)
		if (!announce) {
			throw new Error(`announce OK for unknown announce: ${msg.namespace}`)
		}

		announce.onOk()
	}

	onError(msg: Control.AnnounceError) {
		const announce = this.#send.get(msg.namespace)
		if (!announce) {
			// TODO debug this
			console.warn(`announce error for unknown announce: ${msg.namespace}`)
			return
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

	// The current state, updated by control messages.
	#state = new Watch<"init" | "ack" | Error>("init")

	constructor(control: Control.Stream, namespace: string) {
		this.#control = control
		this.namespace = namespace
	}

	async ok() {
		for (;;) {
			const [state, next] = this.#state.value()
			if (state === "ack") return
			if (state instanceof Error) throw state
			if (!next) throw new Error("closed")

			await next
		}
	}

	async active() {
		for (;;) {
			const [state, next] = this.#state.value()
			if (state instanceof Error) throw state
			if (!next) return

			await next
		}
	}

	async close(_code = 0n, _reason = "") {
		// TODO implement unsubscribe
		// await this.#inner.sendReset(code, reason)
	}

	closed() {
		const [state, next] = this.#state.value()
		return state instanceof Error || next == undefined
	}

	onOk() {
		if (this.closed()) return
		this.#state.update("ack")
	}

	onError(code: bigint, reason: string) {
		if (this.closed()) return

		const err = new Error(`ANNOUNCE_ERROR (${code})` + reason ? `: ${reason}` : "")
		this.#state.update(err)
	}
}

export class AnnounceRecv {
	#control: Control.Stream
	#subscribe: Subscribe

	readonly namespace: string

	// The current state of the announce
	#state: "init" | "ack" | "closed" = "init"

	constructor(control: Control.Stream, subscribe: Subscribe, namespace: string) {
		this.#control = control // so we can send messages
		this.#subscribe = subscribe // literally just for the subscribe() helper method
		this.namespace = namespace
	}

	// Acknowledge the subscription as valid.
	async ok() {
		if (this.#state !== "init") return
		this.#state = "ack"

		// Send the control message.
		return this.#control.send({ type: Control.Type.AnnounceOk, namespace: this.namespace })
	}

	async close(code = 0n, reason = "") {
		if (this.#state === "closed") return
		this.#state = "closed"

		return this.#control.send({ type: Control.Type.AnnounceError, namespace: this.namespace, code, reason })
	}

	// Helper to subscribe to the received announced namespace.
	async subscribe(name: string) {
		return this.#subscribe.send(name, this)
	}
}
