import { Reader, Writer } from "./stream"

export type Message = Subscriber | Publisher

// Sent by subscriber
export type Subscriber = Subscribe | Unsubscribe | AnnounceOk | AnnounceError

export function isSubscriber(m: Message): m is Subscriber {
	return (
		m.kind == Msg.Subscribe || m.kind == Msg.Unsubscribe || m.kind == Msg.AnnounceOk || m.kind == Msg.AnnounceError
	)
}

// Sent by publisher
export type Publisher = SubscribeOk | SubscribeReset | SubscribeError | SubscribeFin | Announce | Unannounce

export function isPublisher(m: Message): m is Publisher {
	return (
		m.kind == Msg.SubscribeOk ||
		m.kind == Msg.SubscribeReset ||
		m.kind == Msg.SubscribeError ||
		m.kind == Msg.SubscribeFin ||
		m.kind == Msg.Announce ||
		m.kind == Msg.Unannounce
	)
}

// I wish we didn't have to split Msg and Id into separate enums.
// However using the string in the message makes it easier to debug.
// We'll take the tiny performance hit until I'm better at Typescript.
export enum Msg {
	// NOTE: object and setup are in other modules
	Subscribe = "subscribe",
	SubscribeOk = "subscribe_ok",
	SubscribeError = "subscribe_error",
	SubscribeReset = "subscribe_reset",
	SubscribeFin = "subscribe_fin",
	Unsubscribe = "unsubscribe",
	Announce = "announce",
	AnnounceOk = "announce_ok",
	AnnounceError = "announce_error",
	Unannounce = "unannounce",
	GoAway = "go_away",
}

enum Id {
	// NOTE: object and setup are in other modules
	// Object = 0,
	// Setup = 1,

	Subscribe = 0x3,
	SubscribeOk = 0x4,
	SubscribeError = 0x5,
	SubscribeReset = 0xc,
	SubscribeFin = 0xb,
	Unsubscribe = 0xa,
	Announce = 0x6,
	AnnounceOk = 0x7,
	AnnounceError = 0x8,
	Unannounce = 0x9,
	GoAway = 0x10,
}

export interface Subscribe {
	kind: Msg.Subscribe

	id: bigint
	trackId: bigint
	namespace: string
	name: string

	start_group: Location
	start_object: Location
	end_group: Location
	end_object: Location

	params?: Parameters
}

export interface Location {
	mode: "none" | "absolute" | "latest" | "future"
	value?: number // ignored for type=none, otherwise defaults to 0
}

export type Parameters = Map<bigint, Uint8Array>

export interface SubscribeOk {
	kind: Msg.SubscribeOk
	id: bigint
}

export interface SubscribeReset {
	kind: Msg.SubscribeReset
	id: bigint
	code: bigint
	reason: string
	final_group: number
	final_object: number
}

export interface SubscribeFin {
	kind: Msg.SubscribeFin
	id: bigint
	final_group: number
	final_object: number
}

export interface SubscribeError {
	kind: Msg.SubscribeError
	id: bigint
	code: bigint
	reason: string
}

export interface Unsubscribe {
	kind: Msg.Unsubscribe
	id: bigint
}

export interface Announce {
	kind: Msg.Announce
	namespace: string
	params?: Parameters
}

export interface AnnounceOk {
	kind: Msg.AnnounceOk
	namespace: string
}

export interface AnnounceError {
	kind: Msg.AnnounceError
	namespace: string
	code: bigint
	reason: string
}

export interface Unannounce {
	kind: Msg.Unannounce
	namespace: string
}

export class Stream {
	private decoder: Decoder
	private encoder: Encoder

	#mutex = Promise.resolve()

	constructor(r: Reader, w: Writer) {
		this.decoder = new Decoder(r)
		this.encoder = new Encoder(w)
	}

	// Will error if two messages are read at once.
	async recv(): Promise<Message> {
		const msg = await this.decoder.message()
		console.log("received message", msg)
		return msg
	}

	async send(msg: Message) {
		const unlock = await this.#lock()
		try {
			console.log("sending message", msg)
			await this.encoder.message(msg)
		} finally {
			unlock()
		}
	}

	async #lock() {
		// Make a new promise that we can resolve later.
		let done: () => void
		const p = new Promise<void>((resolve) => {
			done = () => resolve()
		})

		// Wait until the previous lock is done, then resolve our our lock.
		const lock = this.#mutex.then(() => done)

		// Save our lock as the next lock.
		this.#mutex = p

		// Return the lock.
		return lock
	}
}

export class Decoder {
	r: Reader

	constructor(r: Reader) {
		this.r = r
	}

	private async msg(): Promise<Msg> {
		const t = await this.r.u53()
		switch (t) {
			case Id.Subscribe:
				return Msg.Subscribe
			case Id.SubscribeOk:
				return Msg.SubscribeOk
			case Id.SubscribeReset:
				return Msg.SubscribeReset
			case Id.SubscribeFin:
				return Msg.SubscribeFin
			case Id.SubscribeError:
				return Msg.SubscribeError
			case Id.Unsubscribe:
				return Msg.Unsubscribe
			case Id.Announce:
				return Msg.Announce
			case Id.AnnounceOk:
				return Msg.AnnounceOk
			case Id.AnnounceError:
				return Msg.AnnounceError
			case Id.Unannounce:
				return Msg.Unannounce
			case Id.GoAway:
				return Msg.GoAway
		}

		throw new Error(`unknown control message type: ${t}`)
	}

	async message(): Promise<Message> {
		const t = await this.msg()
		switch (t) {
			case Msg.Subscribe:
				return this.subscribe()
			case Msg.SubscribeOk:
				return this.subscribe_ok()
			case Msg.SubscribeReset:
				return this.subscribe_reset()
			case Msg.SubscribeError:
				return this.subscribe_error()
			case Msg.SubscribeFin:
				return this.subscribe_fin()
			case Msg.Unsubscribe:
				return this.unsubscribe()
			case Msg.Announce:
				return this.announce()
			case Msg.AnnounceOk:
				return this.announce_ok()
			case Msg.Unannounce:
				return this.unannounce()
			case Msg.AnnounceError:
				return this.announce_error()
			case Msg.GoAway:
				throw new Error("TODO: implement go away")
		}
	}

	private async subscribe(): Promise<Subscribe> {
		return {
			kind: Msg.Subscribe,
			id: await this.r.u62(),
			trackId: await this.r.u62(),
			namespace: await this.r.string(),
			name: await this.r.string(),
			start_group: await this.location(),
			start_object: await this.location(),
			end_group: await this.location(),
			end_object: await this.location(),
			params: await this.parameters(),
		}
	}

	private async location(): Promise<Location> {
		const mode = await this.r.u62()
		if (mode == 0n) {
			return { mode: "none", value: 0 }
		} else if (mode == 1n) {
			return { mode: "absolute", value: await this.r.u53() }
		} else if (mode == 2n) {
			return { mode: "latest", value: await this.r.u53() }
		} else if (mode == 3n) {
			return { mode: "future", value: await this.r.u53() }
		} else {
			throw new Error(`invalid location mode: ${mode}`)
		}
	}

	private async parameters(): Promise<Parameters | undefined> {
		const count = await this.r.u53()
		if (count == 0) return undefined

		const params = new Map<bigint, Uint8Array>()

		for (let i = 0; i < count; i++) {
			const id = await this.r.u62()
			const size = await this.r.u53()
			const value = await this.r.readExact(size)

			if (params.has(id)) {
				throw new Error(`duplicate parameter id: ${id}`)
			}

			params.set(id, value)
		}

		return params
	}

	private async subscribe_ok(): Promise<SubscribeOk> {
		return {
			kind: Msg.SubscribeOk,
			id: await this.r.u62(),
		}
	}

	private async subscribe_reset(): Promise<SubscribeReset> {
		return {
			kind: Msg.SubscribeReset,
			id: await this.r.u62(),
			code: await this.r.u62(),
			reason: await this.r.string(),
			final_group: await this.r.u53(),
			final_object: await this.r.u53(),
		}
	}

	private async subscribe_fin(): Promise<SubscribeFin> {
		return {
			kind: Msg.SubscribeFin,
			id: await this.r.u62(),
			final_group: await this.r.u53(),
			final_object: await this.r.u53(),
		}
	}

	private async subscribe_error(): Promise<SubscribeError> {
		return {
			kind: Msg.SubscribeError,
			id: await this.r.u62(),
			code: await this.r.u62(),
			reason: await this.r.string(),
		}
	}

	private async unsubscribe(): Promise<Unsubscribe> {
		return {
			kind: Msg.Unsubscribe,
			id: await this.r.u62(),
		}
	}

	private async announce(): Promise<Announce> {
		const namespace = await this.r.string()

		return {
			kind: Msg.Announce,
			namespace,
			params: await this.parameters(),
		}
	}

	private async announce_ok(): Promise<AnnounceOk> {
		return {
			kind: Msg.AnnounceOk,
			namespace: await this.r.string(),
		}
	}

	private async announce_error(): Promise<AnnounceError> {
		return {
			kind: Msg.AnnounceError,
			namespace: await this.r.string(),
			code: await this.r.u62(),
			reason: await this.r.string(),
		}
	}

	private async unannounce(): Promise<Unannounce> {
		return {
			kind: Msg.Unannounce,
			namespace: await this.r.string(),
		}
	}
}

export class Encoder {
	w: Writer

	constructor(w: Writer) {
		this.w = w
	}

	async message(m: Message) {
		switch (m.kind) {
			case Msg.Subscribe:
				return this.subscribe(m)
			case Msg.SubscribeOk:
				return this.subscribe_ok(m)
			case Msg.SubscribeReset:
				return this.subscribe_reset(m)
			case Msg.SubscribeError:
				return this.subscribe_error(m)
			case Msg.SubscribeFin:
				return this.subscribe_fin(m)
			case Msg.Unsubscribe:
				return this.unsubscribe(m)
			case Msg.Announce:
				return this.announce(m)
			case Msg.AnnounceOk:
				return this.announce_ok(m)
			case Msg.AnnounceError:
				return this.announce_error(m)
			case Msg.Unannounce:
				return this.unannounce(m)
		}
	}

	async subscribe(s: Subscribe) {
		await this.w.u53(Id.Subscribe)
		await this.w.u62(s.id)
		await this.w.u62(s.trackId)
		await this.w.string(s.namespace)
		await this.w.string(s.name)
		await this.location(s.start_group)
		await this.location(s.start_object)
		await this.location(s.end_group)
		await this.location(s.end_object)
		await this.parameters(s.params)
	}

	private async location(l: Location) {
		if (l.mode == "none") {
			await this.w.u8(0)
		} else if (l.mode == "absolute") {
			await this.w.u8(1)
			await this.w.u53(l.value ?? 0)
		} else if (l.mode == "latest") {
			await this.w.u8(2)
			await this.w.u53(l.value ?? 0)
		} else if (l.mode == "future") {
			await this.w.u8(3)
			await this.w.u53(l.value ?? 0)
		}
	}

	private async parameters(p: Parameters | undefined) {
		if (!p) {
			await this.w.u8(0)
			return
		}

		await this.w.u53(p.size)
		for (const [id, value] of p) {
			await this.w.u62(id)
			await this.w.u53(value.length)
			await this.w.write(value)
		}
	}

	async subscribe_ok(s: SubscribeOk) {
		await this.w.u53(Id.SubscribeOk)
		await this.w.u62(s.id)
	}

	async subscribe_reset(s: SubscribeReset) {
		await this.w.u53(Id.SubscribeReset)
		await this.w.u62(s.id)
		await this.w.u62(s.code)
		await this.w.string(s.reason)
		await this.w.u53(s.final_group)
		await this.w.u53(s.final_object)
	}

	async subscribe_fin(s: SubscribeFin) {
		await this.w.u53(Id.SubscribeFin)
		await this.w.u62(s.id)
		await this.w.u53(s.final_group)
		await this.w.u53(s.final_object)
	}

	async subscribe_error(s: SubscribeError) {
		await this.w.u53(Id.SubscribeError)
		await this.w.u62(s.id)
	}

	async unsubscribe(s: Unsubscribe) {
		await this.w.u53(Id.Unsubscribe)
		await this.w.u62(s.id)
	}

	async announce(a: Announce) {
		await this.w.u53(Id.Announce)
		await this.w.string(a.namespace)
	}

	async announce_ok(a: AnnounceOk) {
		await this.w.u53(Id.AnnounceOk)
		await this.w.string(a.namespace)
	}

	async announce_error(a: AnnounceError) {
		await this.w.u53(Id.AnnounceError)
		await this.w.string(a.namespace)
		await this.w.u62(a.code)
		await this.w.string(a.reason)
	}

	async unannounce(a: Unannounce) {
		await this.w.u53(Id.Unannounce)
		await this.w.string(a.namespace)
	}
}
