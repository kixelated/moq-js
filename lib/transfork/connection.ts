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
		await Promise.all([this.#runSession(), this.#runBidis(), this.#runUnis()])
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
		const streams = this.#quic.incomingBidirectionalStreams.getReader()

		for (;;) {
			const { value, done } = await streams.read()
			if (done) break

			const stream = new Stream(value)
			this.#runBidi(stream).catch((err) => stream.writer.reset(Closed.extract(err)))
		}
	}

	async #runBidi(stream: Stream) {
		const typ = await stream.reader.u8()

		switch (typ) {
			case Message.StreamBi.Session:
				throw new Error("duplicate session stream")
			case Message.StreamBi.Announce:
				if (!this.#subscriber) {
					throw new Error("not a subscriber")
				}

				return await this.#subscriber.runAnnounce(stream)
			case Message.StreamBi.Subscribe:
				if (!this.#publisher) {
					throw new Error("not a publisher")
				}

				return await this.#publisher.runSubscribe(stream)
			case Message.StreamBi.Datagrams:
				if (!this.#publisher) {
					throw new Error("not a publisher")
				}

				return await this.#publisher.runDatagrams(stream)
			case Message.StreamBi.Fetch:
				if (!this.#publisher) {
					throw new Error("not a publisher")
				}

				return await this.#publisher.runFetch(stream)
			case Message.StreamBi.Info:
				if (!this.#publisher) {
					throw new Error("not a publisher")
				}

				return await this.#publisher.runInfo(stream)
			default:
				throw new Error("unknown bi stream type: " + typ)
		}
	}

	async #runUnis() {
		const streams = this.#quic.incomingUnidirectionalStreams.getReader()

		for (;;) {
			const { value, done } = await streams.read()
			if (done) {
				break
			}

			const stream = new Reader(value)
			this.#runUni(stream).catch((err) => stream.stop(Closed.extract(err)))
		}
	}

	async #runUni(stream: Reader) {
		const typ = await stream.u8()

		switch (typ) {
			case Message.StreamUni.Group:
				if (!this.#subscriber) {
					throw new Error("not a subscriber")
				}

				return this.#subscriber.runGroup(stream)
			default:
				throw new Error("unknown uni stream type: " + typ)
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
