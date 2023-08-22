import { Connection } from "../transport/connection"
import { AnnounceRecv } from "../transport/announce"
import { asError } from "../common/error"
import { Reader } from "../transport/stream"
import { Catalog } from "../common/catalog"
import { Queue } from "../common/async"

export class Broadcasts {
	#queue = new Queue<Broadcast>()

	readonly connection: Connection

	constructor(connection: Connection) {
		this.connection = connection
		this.#run().catch((e) => {
			const err = asError(e)
			return this.#queue.abort(err) // throw an exception on next read
		})
	}

	async #run() {
		for (;;) {
			const next = await this.connection.announce.recv()
			if (!next) return

			// Asynchronously fetch the catalog
			this.#fetch(next)
				.then((broadcast) => this.#queue.push(broadcast))
				.catch((e) => {
					const err = asError(e)
					console.warn("failed to fetch catalog", err)
				})
		}
	}

	async next(): Promise<Broadcast> {
		// We don't return undefined since we never call `close`
		const broadcast = await this.#queue.next()
		return broadcast!
	}

	async #fetch(announce: AnnounceRecv): Promise<Broadcast> {
		const subscribe = await announce.subscribe(".catalog")
		try {
			const segment = await subscribe.data()
			if (!segment) throw new Error("no catalog data")

			const { header, stream } = segment

			if (header.sequence !== 0n) {
				throw new Error("TODO delta updates not supported")
			}

			const reader = new Reader(stream)
			const raw = await reader.readAll()

			await subscribe.close() // we done

			const catalog = Catalog.decode(raw)
			const broadcast = new Broadcast(this, announce, catalog)

			return broadcast
		} catch (e) {
			const err = asError(e)

			// Close the subscription after we're done.
			await subscribe.close(1n, err.message)

			throw err
		}
	}
}

export class Broadcast {
	#announce: AnnounceRecv

	readonly catalog: Catalog
	readonly connection: Connection

	constructor(broadcasts: Broadcasts, announce: AnnounceRecv, catalog: Catalog) {
		this.#announce = announce
		this.catalog = catalog
		this.connection = broadcasts.connection
	}

	get name() {
		return this.#announce.namespace
	}

	async subscribe(name: string) {
		return this.#announce.subscribe(name)
	}
}
