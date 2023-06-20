import { Deferred } from "./deferred"

export class Notify {
	#next: Deferred<void> = new Deferred<void>()

	broadcast() {
		this.#next.resolve()
		this.#next = new Deferred<void>()
	}

	async wait() {
		await this.#next.promise
	}
}
