import * as Message from "./message"
import { asError } from "../common/error"
import { Stream, Reader } from "./stream"

import { Announce, Publisher } from "./publisher"
import { Announced, Subscriber } from "./subscriber"
import { Broadcast, Track, TrackReader } from "./model"
import { Closed } from "./error"

export class Connection {
	// The established WebTransport session.
	#quic: WebTransport

	// Use to receive/send session messages.
	#session: Stream

	// Module for contributing tracks.
	#publisher?: Publisher

	// Module for distributing tracks.
	#subscriber?: Subscriber

	// Async work running in the background
	#running: Promise<void>

	constructor(quic: WebTransport, role: Message.Role, session: Stream) {
		this.#quic = quic
		this.#session = session

		if (role == "publisher" || role == "both") {
			this.#publisher = new Publisher(this.#quic)
		}

		if (role == "subscriber" || role == "both") {
			this.#subscriber = new Subscriber(this.#quic)
		}

		this.#running = this.#run()
	}

	close(code = 0, reason = "") {
		this.#quic.close({ closeCode: code, reason })
	}

	async #run(): Promise<void> {
		const session = this.#runSession().catch((err) => new Error("failed to run session: ", err))
		const bidis = this.#runBidis().catch((err) => new Error("failed to run bidis: ", err))
		const unis = this.#runUnis().catch((err) => new Error("failed to run unis: ", err))

		await Promise.all([session, bidis, unis])
	}

	announce(broadcast: Broadcast): Announce {
		if (!this.#publisher) {
			throw new Error("not a publisher")
		}

		return this.#publisher.announce(broadcast)
	}

	async announced(): Promise<Announced | undefined> {
		if (!this.#subscriber) {
			throw new Error("not a subscriber")
		}

		return this.#subscriber.announced()
	}

	subscribe(track: Track): TrackReader {
		if (!this.#subscriber) {
			throw new Error("not a subscriber")
		}

		return this.#subscriber.subscribe(track)
	}

	/* TODO support non-announced broadcasts
	async subscribed(): Promise<Subscribed | undefined> {
		if (!this.#publisher) {
			throw new Error("not a publisher")
		}

		return this.#publisher.subscribed()
	}
	*/

	async #runSession() {
		// Receive messages until the connection is closed.
		for (;;) {
			const msg = await Message.SessionInfo.decode_maybe(this.#session.reader)
			if (!msg) break
			// TODO use the session info
		}
	}

	async #runBidis() {
		for (;;) {
			const next = await Stream.accept(this.#quic)
			if (!next) {
				break
			}

			const [msg, stream] = next
			this.#runBidi(msg, stream).catch((err) => stream.writer.reset(Closed.extract(err)))
		}
	}

	async #runBidi(msg: Message.Bi, stream: Stream) {
		if (msg instanceof Message.SessionClient) {
			throw new Error("duplicate session stream")
		} else if (msg instanceof Message.Announce) {
			if (!this.#subscriber) {
				throw new Error("not a subscriber")
			}

			return await this.#subscriber.runAnnounce(msg, stream)
		} else if (msg instanceof Message.Subscribe) {
			if (!this.#publisher) {
				throw new Error("not a publisher")
			}

			return await this.#publisher.runSubscribe(msg, stream)
		} else if (msg instanceof Message.Datagrams) {
			if (!this.#publisher) {
				throw new Error("not a publisher")
			}

			return await this.#publisher.runDatagrams(msg, stream)
		} else if (msg instanceof Message.Fetch) {
			if (!this.#publisher) {
				throw new Error("not a publisher")
			}

			return await this.#publisher.runFetch(msg, stream)
		} else if (msg instanceof Message.InfoRequest) {
			if (!this.#publisher) {
				throw new Error("not a publisher")
			}

			return await this.#publisher.runInfo(msg, stream)
		} else {
			const _: never = msg
		}
	}

	async #runUnis() {
		for (;;) {
			const next = await Reader.accept(this.#quic)
			if (!next) {
				break
			}

			const [msg, stream] = next
			this.#runUni(msg, stream).catch((err) => stream.stop(Closed.extract(err)))
		}
	}

	async #runUni(msg: Message.Uni, stream: Reader) {
		if (msg instanceof Message.Group) {
			if (!this.#subscriber) {
				throw new Error("not a subscriber")
			}

			return this.#subscriber.runGroup(msg, stream)
		} else {
			const _: never = msg
		}
	}

	async closed(): Promise<Error> {
		try {
			await this.#running
			return new Error("closed")
		} catch (e) {
			return asError(e)
		}
	}
}
