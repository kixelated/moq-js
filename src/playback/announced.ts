import { Connection } from "../transport/connection"
import { AnnounceRecv } from "../transport/announce"
import { asError } from "../common/error"
import { Reader } from "../transport/stream"
import { Catalog } from "../common/catalog"

export class Announced {
	#conn: Connection

	constructor(conn: Connection) {
		this.#conn = conn
	}

	async broadcast() {
		const announce = await this.#conn.announce.recv()
		if (!announce) return

		await announce.ok()

		return new Broadcast(announce)
	}
}

export class Broadcast {
	#announce: AnnounceRecv

	catalog: Promise<Catalog>

	constructor(announce: AnnounceRecv) {
		this.#announce = announce
		this.catalog = this.#fetch()
	}

	async #fetch(): Promise<Catalog> {
		const subscribe = await this.#announce.subscribe(".catalog")
		try {
			const segment = await subscribe.data()
			if (!segment) throw new Error("no catalog data")

			const { header, stream } = segment

			if (header.sequence !== 0n) {
				throw new Error("TODO delta updates not supported")
			}

			const reader = new Reader(stream)
			const raw = await reader.readAll()

			const catalog = Catalog.decode(raw)

			await subscribe.close() // we done

			return catalog
		} catch (e) {
			const err = asError(e)

			// Close the subscription after we're done.
			await subscribe.close(1n, err.message)

			throw err
		}
	}

	get name() {
		return this.#announce.namespace
	}

	async subscribe(name: string) {
		return this.#announce.subscribe(name)
	}
}
