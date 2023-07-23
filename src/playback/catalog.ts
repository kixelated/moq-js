import { Connection } from "../transport/connection"
import * as MP4 from "../common/mp4"
import { AnnounceRecv } from "../transport/announce"
import { decodeInit } from "./container"
import { asError } from "../common/error"

export class Catalog {
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
	#catalog: Promise<{ info: MP4.Info; raw: Uint8Array }>

	constructor(announce: AnnounceRecv) {
		this.#announce = announce
		this.#catalog = this.#fetch()
	}

	async #fetch() {
		const subscribe = await this.#announce.subscribe("0")
		try {
			const segment = await subscribe.data()
			if (!segment) throw new Error("no catalog data")

			const { header, stream } = segment

			if (header.sequence !== 0n) {
				throw new Error("TODO delta updates not supported")
			}

			const { info, raw } = await decodeInit(stream)

			await subscribe.close() // we done

			return { info, raw }
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

	async info() {
		return (await this.#catalog).info
	}

	async init() {
		return (await this.#catalog).raw
	}

	async subscribe(track: number) {
		return this.#announce.subscribe(track.toString())
	}
}
