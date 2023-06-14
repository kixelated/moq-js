import { Reader, Writer } from "../stream"

export type Message = Client | Server
export type Role = "publisher" | "subscriber" | "both"
export type Version = number

export interface Client {
	versions: Version[]
	role: Role
	path?: string
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
		const count = await this.r.vint52()

		const versions = []
		for (let i = 0; i < count; i++) {
			const version = await this.r.vint52()
			versions.push(version)
		}

		let role: Role | undefined
		let path

		while (!this.r.done()) {
			const id = await this.r.vint52()
			if (id == 0) {
				role = await this.role()
			} else if (id == 1) {
				path = await this.r.string()
			} else {
				throw new Error(`unknown param: ${id}`)
			}
		}

		if (!role) {
			throw new Error("missing role")
		}

		return {
			versions,
			role,
			path,
		}
	}

	async server(): Promise<Server> {
		const version = await this.r.vint52()

		let role: Role | undefined

		while (!this.r.done()) {
			const id = await this.r.vint52()
			if (id == 0) {
				role = await this.role()
			} else if (id == 1) {
				throw new Error(`path not allowed for server`)
			} else {
				throw new Error(`unknown param: ${id}`)
			}
		}

		if (!role) {
			throw new Error("missing role")
		}

		return {
			version,
			role,
		}
	}

	async role(): Promise<Role> {
		const v = await this.r.vint52()
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
		await this.w.vint52(c.versions.length)
		for (const v of c.versions) {
			await this.w.vint52(v)
		}
		await this.w.vint52(0)
		await this.role(c.role)

		if (c.path !== undefined) {
			await this.w.vint52(1)
			await this.w.string(c.path)
		}
	}

	async server(s: Server) {
		await this.w.vint52(s.version)
		await this.w.vint52(0) // role id
		await this.role(s.role)
	}

	async role(r: Role) {
		let v
		if (r == "publisher") {
			v = 0
		} else if (r == "subscriber") {
			v = 1
		} else if (r == "both") {
			v = 2
		} else {
			throw new Error(`invalid role: ${r}`)
		}

		return this.w.vint52(v)
	}
}
