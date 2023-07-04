import * as Control from "./control"
import * as Object from "./object"

import { Announce } from "./announce"
import { Subscribe } from "./subscribe"

export class Connection {
	#quic: WebTransport

	// Use to receive/send control messages.
	#control: Control.Stream

	// Use to receive/send objects.
	#objects: Object.Transport

	// Module for announcing tracks.
	readonly announce: Announce

	// Module for subscribing to tracks
	readonly subscribe: Subscribe

	constructor(quic: WebTransport, control: Control.Stream, objects: Object.Transport) {
		this.#quic = quic
		this.#control = control
		this.#objects = objects

		this.subscribe = new Subscribe(this.#control, this.#objects)
		this.announce = new Announce(this.#control, this.subscribe)
	}

	close(err: any = new Error("closed by application")) {
		this.announce.close(err)
		this.subscribe.close(err)
		this.#quic.close()
	}

	async run() {
		// Wait for the connection to be established.
		const control = this.#control

		// Receive messages until the connection is closed.
		for (;;) {
			const msg = await control.recv()
			await this.#receive(msg)
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

	// Returns the next data stream and the cooresponding subscription.
	async data() {
		return this.subscribe.data()
	}
}
