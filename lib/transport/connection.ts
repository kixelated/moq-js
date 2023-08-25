import * as Control from "./control"
import { Objects } from "./object"
import { asError } from "../common/error"

import { Announce, AnnounceRecv, AnnounceSend } from "./announce"
import { Subscribe, SubscribeRecv, SubscribeSend } from "./subscribe"

export class Connection {
	// The established WebTransport session.
	#quic: WebTransport

	// Use to receive/send control messages.
	#control: Control.Stream

	// Use to receive/send objects.
	#objects: Objects

	// Module for announcing tracks.
	#announce: Announce

	// Module for subscribing to tracks
	#subscribe: Subscribe

	// Async work running in the background
	#running: Promise<void>

	constructor(quic: WebTransport, control: Control.Stream, objects: Objects) {
		this.#quic = quic
		this.#control = control
		this.#objects = objects
		this.#announce = new Announce(this.#control)
		this.#subscribe = new Subscribe(this.#control, this.#objects)

		this.#running = this.#run()
	}

	close(code = 0, reason = "") {
		this.#quic.close({ closeCode: code, reason })
	}

	async #run(): Promise<void> {
		await Promise.all([this.#runControl(), this.#runObjects()])
	}

	async announce(namespace: string): Promise<AnnounceSend> {
		return this.#announce.send(namespace)
	}

	async announced(): Promise<AnnounceRecv | undefined> {
		return this.#announce.recv()
	}

	async subscribe(namespace: string, track: string): Promise<SubscribeSend> {
		return this.#subscribe.send(namespace, track)
	}

	async subscribed(): Promise<SubscribeRecv | undefined> {
		return this.#subscribe.recv()
	}

	async #runControl() {
		// Receive messages until the connection is closed.
		for (;;) {
			const msg = await this.#control.recv()
			await this.#receive(msg)
		}
	}

	async #runObjects() {
		for (;;) {
			const obj = await this.#objects.recv()
			if (!obj) break

			await this.#subscribe.onData(obj.header, obj.stream)
		}
	}

	async #receive(msg: Control.Message) {
		switch (msg.type) {
			case Control.Type.Announce:
				return this.#announce.onAnnounce(msg)
			case Control.Type.AnnounceOk:
				return this.#announce.onOk(msg)
			case Control.Type.AnnounceError:
				return this.#announce.onError(msg)
			case Control.Type.Subscribe:
				return this.#subscribe.onSubscribe(msg)
			case Control.Type.SubscribeOk:
				return this.#subscribe.onOk(msg)
			case Control.Type.SubscribeError:
				return this.#subscribe.onError(msg)
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
