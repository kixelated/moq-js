import { Reader, Writer } from "./stream"

export type Message = Subscriber | Publisher
export type Subscriber = Subscribe | AnnounceOk | AnnounceError
export type Publisher = SubscribeOk | SubscribeError | Announce

export enum Type {
	// NOTE: object and setup are in other modules
	// Object = 0,
	// Setup = 1,

	Subscribe = 3,
	SubscribeOk = 4,
	SubscribeError = 5,
	Announce = 6,
	AnnounceOk = 7,
	AnnounceError = 8,
}

// NOTE: These are forked from moq-transport-00.
//   1. subscribe specifies the track_id, not subscribe_ok
//   2. messages lack a specified length
//   3. optional parameters are not supported (announce, subscribe)
//   4. not allowed on undirectional streams; only after SETUP on the bidirectional stream

export interface Subscribe {
	type: Type.Subscribe

	id: bigint
	namespace: string
	name: string
}

export interface SubscribeOk {
	type: Type.SubscribeOk
	id: bigint
	expires?: bigint // ms
}

export interface SubscribeError {
	type: Type.SubscribeError
	id: bigint
	code: bigint
	reason: string
}

export interface Announce {
	type: Type.Announce
	namespace: string
}

export interface AnnounceOk {
	type: Type.AnnounceOk
	namespace: string
}

export interface AnnounceError {
	type: Type.AnnounceError
	namespace: string
	code: bigint
	reason: string
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

	private async type(): Promise<Type> {
		const t = await this.r.u52()
		if (t in Type) return t
		throw new Error(`unknown control message type: ${t}`)
	}

	async message(): Promise<Message> {
		const t = await this.type()
		switch (t) {
			case Type.Subscribe:
				return this.subscribe()
			case Type.SubscribeOk:
				return this.subscribe_ok()
			case Type.SubscribeError:
				return this.subscribe_error()
			case Type.Announce:
				return this.announce()
			case Type.AnnounceOk:
				return this.announce_ok()
			case Type.AnnounceError:
				return this.announce_error()
		}
	}

	private async subscribe(): Promise<Subscribe> {
		const id = await this.r.u62()
		const namespace = await this.r.string()
		const name = await this.r.string()

		return {
			type: Type.Subscribe,
			id,
			namespace,
			name,
		}
	}

	private async subscribe_ok(): Promise<SubscribeOk> {
		return {
			type: Type.SubscribeOk,
			id: await this.r.u62(),
			expires: await this.r.u62(),
		}
	}

	private async subscribe_error(): Promise<SubscribeError> {
		return {
			type: Type.SubscribeError,
			id: await this.r.u62(),
			code: await this.r.u62(),
			reason: await this.r.string(),
		}
	}

	private async announce(): Promise<Announce> {
		const namespace = await this.r.string()

		return {
			type: Type.Announce,
			namespace,
		}
	}

	private async announce_ok(): Promise<AnnounceOk> {
		return {
			type: Type.AnnounceOk,
			namespace: await this.r.string(),
		}
	}

	private async announce_error(): Promise<AnnounceError> {
		return {
			type: Type.AnnounceError,
			namespace: await this.r.string(),
			code: await this.r.u62(),
			reason: await this.r.string(),
		}
	}
}

export class Encoder {
	w: Writer

	constructor(w: Writer) {
		this.w = w
	}

	async message(m: Message) {
		await this.w.u52(m.type)

		switch (m.type) {
			case Type.Subscribe:
				return this.subscribe(m)
			case Type.SubscribeOk:
				return this.subscribe_ok(m)
			case Type.SubscribeError:
				return this.subscribe_error(m)
			case Type.Announce:
				return this.announce(m)
			case Type.AnnounceOk:
				return this.announce_ok(m)
			case Type.AnnounceError:
				return this.announce_error(m)
		}
	}

	async subscribe(s: Subscribe) {
		await this.w.u62(s.id)
		await this.w.string(s.namespace)
		await this.w.string(s.name)
	}

	async subscribe_ok(s: SubscribeOk) {
		await this.w.u62(s.id)
		await this.w.u62(s.expires ?? 0n)
	}

	async subscribe_error(s: SubscribeError) {
		await this.w.u62(s.id)
		await this.w.u62(s.code)
		await this.w.string(s.reason)
	}

	async announce(a: Announce) {
		await this.w.string(a.namespace)
	}

	async announce_ok(a: AnnounceOk) {
		await this.w.string(a.namespace)
	}

	async announce_error(a: AnnounceError) {
		await this.w.string(a.namespace)
		await this.w.u62(a.code)
		await this.w.string(a.reason)
	}
}
