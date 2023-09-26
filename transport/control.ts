import { Reader, Writer } from "./stream"

export type Message = Subscriber | Publisher
export type Subscriber = Subscribe | SubscribeEnd | AnnounceOk | AnnounceReset
export type Publisher = SubscribeOk | SubscribeReset | Announce | AnnounceEnd

// I wish we didn't have to split Msg and Id into separate enums.
// However using the string in the message makes it easier to debug.
// We'll take the tiny performance hit until I'm better at Typescript.
export enum Msg {
	// NOTE: object and setup are in other modules
	// Object = 0,
	// Setup = 1,

	Subscribe = "subscribe",
	SubscribeOk = "subscribe_ok",
	SubscribeReset = "subscribe_reset", // error termination by the publisher
	SubscribeEnd = "subscribe_end", // clean termination by the subscriber
	Announce = "announce",
	AnnounceOk = "announce_ok",
	AnnounceReset = "announce_reset", // error termination by the subscriber
	AnnounceEnd = "announce_end", // clean termination by the publisher
	GoAway = "go_away",
}

enum Id {
	// NOTE: object and setup are in other modules
	// Object = 0,
	// Setup = 1,

	Subscribe = 0x3,
	SubscribeOk = 0x4,
	SubscribeReset = 0x5, // error termination by the publisher
	SubscribeEnd = 0x15, // clean termination by the subscriber
	Announce = 0x6,
	AnnounceOk = 0x7,
	AnnounceReset = 0x8, // error termination by the subscriber
	AnnounceEnd = 0x18, // clean termination by the publisher
	GoAway = 0x10,
}

// NOTE: These are forked from moq-transport-00.
//   1. subscribe specifies the track_id, not subscribe_ok
//   2. messages lack a specified length
//   3. optional parameters are not supported (announce, subscribe)
//   4. not allowed on undirectional streams; only after SETUP on the bidirectional stream

export interface Subscribe {
	kind: Msg.Subscribe

	id: bigint
	namespace: string
	name: string
}

export interface SubscribeOk {
	kind: Msg.SubscribeOk
	id: bigint
}

export interface SubscribeReset {
	kind: Msg.SubscribeReset
	id: bigint
	code: bigint
	reason: string
}

export interface SubscribeEnd {
	kind: Msg.SubscribeEnd
	id: bigint
}

export interface Announce {
	kind: Msg.Announce
	namespace: string
}

export interface AnnounceOk {
	kind: Msg.AnnounceOk
	namespace: string
}

export interface AnnounceReset {
	kind: Msg.AnnounceReset
	namespace: string
	code: bigint
	reason: string
}

export interface AnnounceEnd {
	kind: Msg.AnnounceEnd
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
			case Id.SubscribeEnd:
				return Msg.SubscribeEnd
			case Id.Announce:
				return Msg.Announce
			case Id.AnnounceOk:
				return Msg.AnnounceOk
			case Id.AnnounceReset:
				return Msg.AnnounceReset
			case Id.AnnounceEnd:
				return Msg.AnnounceEnd
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
			case Msg.SubscribeEnd:
				return this.subscribe_end()
			case Msg.Announce:
				return this.announce()
			case Msg.AnnounceOk:
				return this.announce_ok()
			case Msg.AnnounceReset:
				return this.announce_reset()
			case Msg.AnnounceEnd:
				return this.announce_end()
			case Msg.GoAway:
				throw new Error("TODO: implement go away")
		}
	}

	private async subscribe(): Promise<Subscribe> {
		const id = await this.r.u62()
		const namespace = await this.r.string()
		const name = await this.r.string()

		return {
			kind: Msg.Subscribe,
			id,
			namespace,
			name,
		}
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
		}
	}

	private async subscribe_end(): Promise<SubscribeEnd> {
		return {
			kind: Msg.SubscribeEnd,
			id: await this.r.u62(),
		}
	}

	private async announce(): Promise<Announce> {
		const namespace = await this.r.string()

		return {
			kind: Msg.Announce,
			namespace,
		}
	}

	private async announce_ok(): Promise<AnnounceOk> {
		return {
			kind: Msg.AnnounceOk,
			namespace: await this.r.string(),
		}
	}

	private async announce_reset(): Promise<AnnounceReset> {
		return {
			kind: Msg.AnnounceReset,
			namespace: await this.r.string(),
			code: await this.r.u62(),
			reason: await this.r.string(),
		}
	}

	private async announce_end(): Promise<AnnounceEnd> {
		return {
			kind: Msg.AnnounceEnd,
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
			case Msg.SubscribeEnd:
				return this.subscribe_end(m)
			case Msg.Announce:
				return this.announce(m)
			case Msg.AnnounceOk:
				return this.announce_ok(m)
			case Msg.AnnounceReset:
				return this.announce_reset(m)
			case Msg.AnnounceEnd:
				return this.announce_end(m)
		}
	}

	async subscribe(s: Subscribe) {
		await this.w.u53(Id.Subscribe)
		await this.w.u62(s.id)
		await this.w.string(s.namespace)
		await this.w.string(s.name)
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
	}

	async subscribe_end(s: SubscribeEnd) {
		await this.w.u53(Id.SubscribeEnd)
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

	async announce_reset(a: AnnounceReset) {
		await this.w.u53(Id.AnnounceReset)
		await this.w.string(a.namespace)
		await this.w.u62(a.code)
		await this.w.string(a.reason)
	}

	async announce_end(a: AnnounceEnd) {
		await this.w.u53(Id.AnnounceEnd)
		await this.w.string(a.namespace)
	}
}
