import { Connection } from "../transport/connection"
import { AnnounceRecv } from "../transport/announce"
import { asError } from "../common/error"
import { Catalog } from "../media/catalog"
import { Queue } from "../common/async"

/*
export class Broadcasts {
	#queue = new Queue<Broadcast>()

	readonly connection: Connection

	constructor(connection: Connection) {
		this.connection = connection

		this.#run()
			.then(() => this.#queue.close())
			.catch((e) => this.#queue.abort(asError(e)))
	}

	async #run() {
		for (;;) {
			const next = await this.connection.announced()
			if (!next) return

			// Asynchronously fetch the catalog
			this.#fetch(next)
				.then((broadcast) => this.#queue.push(broadcast))
				.catch((e) => console.warn("failed to fetch catalog", asError(e)))
		}
	}

	async next(): Promise<Broadcast> {
		// We don't return undefined since we never call `close`
		const broadcast = await this.#queue.next()
		return broadcast!
	}

	async #fetch(announce: AnnounceRecv): Promise<Broadcast> {
		try {
			const catalog = await Catalog.fetch(this.connection, announce.namespace)
			await announce.ok()
			return { namespace: announce.namespace, catalog }
		} catch (e) {
			const err = asError(e)
			await announce.close(1n, err.message)
			throw err
		}
	}
}
*/

export interface Broadcast {
	namespace: string
	catalog: Catalog
}
