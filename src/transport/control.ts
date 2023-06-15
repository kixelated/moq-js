import { Reader, Writer } from "../stream"

export type Message = Subscriber | Publisher
export type Subscriber = Subscribe | AnnounceOk | AnnounceError
export type Publisher = SubscribeOk | SubscribeError | Announce

export enum Type {
	Subscribe = 3,
	SubscribeOk = 4,
	SubscribeError = 5,
	Announce = 6,
	AnnounceOk = 7,
	AnnounceError = 8,
}

export interface Subscribe {
	type: Type.Subscribe

	id: number
	namespace: string
	name: string

	group?: number
	object?: number
	auth?: string
}

export interface SubscribeOk {
	type: Type.SubscribeOk
	id: number
	expires?: number // ms
}

export interface SubscribeError {
	type: Type.SubscribeError
	id: number
	code: number
	reason: string
}

export interface Announce {
	type: Type.Announce
	namespace: string
	auth?: string
}

export interface AnnounceOk {
	type: Type.AnnounceOk
	namespace: string
}

export interface AnnounceError {
	type: Type.AnnounceError
	namespace: string
	code: number
	reason: string
}

export class Stream {
	private decoder: Decoder
	private encoder: Encoder

	constructor(r: Reader, w: Writer) {
		this.decoder = new Decoder(r)
		this.encoder = new Encoder(w)
	}

	async recv(): Promise<Message> {
		return this.decoder.message()
	}

	async send(msg: Message) {
		return this.encoder.message(msg)
	}
}

export class Decoder {
	r: Reader

	constructor(r: Reader) {
		this.r = r
	}

	private async type(): Promise<Type> {
		return (await this.r.vint52()) as Type
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
			default:
				throw new Error(`unknown message type: ${t}`)
		}
	}

	private async subscribe(): Promise<Subscribe> {
		const id = await this.r.vint52()
		const namespace = await this.r.string()
		const name = await this.r.string()

		let group
		let object
		let auth

		while (!this.r.done()) {
			const id = await this.r.vint52()
			if (id == 0) {
				group = await this.r.vint52()
			} else if (id == 1) {
				object = await this.r.vint52()
			} else if (id == 2) {
				auth = await this.r.string()
			} else {
				throw new Error(`unknown param: ${id}`)
			}
		}

		return {
			type: Type.Subscribe,
			id,
			namespace,
			name,
			group,
			object,
			auth,
		}
	}

	private async subscribe_ok(): Promise<SubscribeOk> {
		return {
			type: Type.SubscribeOk,
			id: await this.r.vint52(),
			expires: await this.r.vint52(),
		}
	}

	private async subscribe_error(): Promise<SubscribeError> {
		return {
			type: Type.SubscribeError,
			id: await this.r.vint52(),
			code: await this.r.vint52(),
			reason: await this.r.string(),
		}
	}

	private async announce(): Promise<Announce> {
		const namespace = await this.r.string()

		let auth

		while (!this.r.done()) {
			const id = await this.r.vint52()
			if (id == 2) {
				auth = await this.r.string()
			} else {
				throw new Error(`unknown param: ${id}`)
			}
		}

		return {
			type: Type.Announce,
			namespace,
			auth,
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
			code: await this.r.vint52(),
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
		this.w.vint52(m.type)

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
		await this.w.vint52(s.id)
		await this.w.string(s.namespace)
		await this.w.string(s.name)

		if (s.group !== undefined) {
			await this.w.vint52(0)
			await this.w.vint52(s.group)
		}

		if (s.object !== undefined) {
			await this.w.vint52(1)
			await this.w.vint52(s.object)
		}

		if (s.auth !== undefined) {
			await this.w.vint52(2)
			await this.w.string(s.auth)
		}
	}

	async subscribe_ok(s: SubscribeOk) {
		await this.w.vint52(s.id)
		await this.w.vint52(s.expires || 0)
	}

	async subscribe_error(s: SubscribeError) {
		await this.w.vint52(s.id)
		await this.w.vint52(s.code)
		await this.w.string(s.reason)
	}

	async announce(a: Announce) {
		await this.w.string(a.namespace)

		if (a.auth !== undefined) {
			await this.w.vint52(2)
			await this.w.string(a.auth)
		}
	}

	async announce_ok(a: AnnounceOk) {
		await this.w.string(a.namespace)
	}

	async announce_error(a: AnnounceError) {
		await this.w.string(a.namespace)
		await this.w.vint52(a.code)
		await this.w.string(a.reason)
	}
}
