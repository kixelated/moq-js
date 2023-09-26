import { Reader, Writer } from "./stream"

export type Message = Client | Server
export type Role = "publisher" | "subscriber" | "both"

export enum Version {
	DRAFT_00 = 0xff00,
	KIXEL_00 = 0xbad00,
}

// NOTE: These are forked from moq-transport-00.
//   1. messages lack a sized length
//   2. parameters are not optional and written in order (role + path)
//   3. role indicates local support only, not remote support

export interface Client {
	versions: Version[]
	role: Role
}

export interface Server {
	version: Version
	role: Role
}

export class Stream {
	recv: Decoder
	send: Encoder

	constructor(r: Reader, w: Writer) {
		this.recv = new Decoder(r)
		this.send = new Encoder(w)
	}
}

export class Decoder {
	r: Reader

	constructor(r: Reader) {
		this.r = r
	}

	async client(): Promise<Client> {
		const type = await this.r.u53()
		if (type !== 1) throw new Error(`client SETUP type must be 1, got ${type}`)

		const count = await this.r.u53()

		const versions = []
		for (let i = 0; i < count; i++) {
			const version = await this.r.u53()
			versions.push(version)
		}

		const role = await this.role()

		return {
			versions,
			role,
		}
	}

	async server(): Promise<Server> {
		const type = await this.r.u53()
		if (type !== 2) throw new Error(`server SETUP type must be 2, got ${type}`)

		const version = await this.r.u53()
		const role = await this.role()

		return {
			version,
			role,
		}
	}

	async role(): Promise<Role> {
		const v = await this.r.u53()
		if (v == 0) {
			return "publisher"
		} else if (v == 1) {
			return "subscriber"
		} else if (v == 2) {
			return "both"
		} else {
			throw new Error(`invalid role: ${v}`)
		}
	}
}

export class Encoder {
	w: Writer

	constructor(w: Writer) {
		this.w = w
	}

	async client(c: Client) {
		await this.w.u53(1) // message_type = 1
		await this.w.u53(c.versions.length)
		for (const v of c.versions) {
			await this.w.u53(v)
		}

		await this.role(c.role)
	}

	async server(s: Server) {
		await this.w.u53(2) // message_type = 2
		await this.w.u53(s.version)
		await this.role(s.role)
	}

	async role(r: Role) {
		let v
		if (r == "publisher") {
			v = 0
		} else if (r == "subscriber") {
			v = 1
		} else {
			v = 2
		}

		return this.w.u53(v)
	}
}
