import * as Control from "./control"
import { Objects } from "./object"

import { Announce } from "./announce"
import { Subscribe } from "./subscribe"

export class Connection {
	#quic: WebTransport

	// Use to receive/send control messages.
	#control: Control.Stream

	// Use to receive/send objects.
	#objects: Objects

	// Module for announcing tracks.
	readonly announce: Announce

	// Module for subscribing to tracks
	readonly subscribe: Subscribe

	constructor(quic: WebTransport, control: Control.Stream, objects: Objects) {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		this.#quic = quic
		this.#control = control
		this.#objects = objects

		this.subscribe = new Subscribe(this.#control, this.#objects)
		this.announce = new Announce(this.#control, this.subscribe)
	}

	close(code = 0, reason = "") {
		// eslint-disable-next-line
		this.#quic.close({ closeCode: code, reason })
	}

	async run() {
		return Promise.all([this.#runControl(), this.#runObjects()])
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

			await this.subscribe.onData(obj.header, obj.stream)
		}
	}

	async #receive(msg: Control.Message) {
		console.log("received", msg)
		switch (msg.type) {
			case Control.Type.Announce:
				return this.announce.onAnnounce(msg)
			case Control.Type.AnnounceOk:
				return this.announce.onOk(msg)
			case Control.Type.AnnounceError:
				return this.announce.onError(msg)
			case Control.Type.Subscribe:
				return this.announce.onSubscribe(msg)
			case Control.Type.SubscribeOk:
				return this.subscribe.onOk(msg)
			case Control.Type.SubscribeError:
				return this.subscribe.onError(msg)
		}
	}
}
