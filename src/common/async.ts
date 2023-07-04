export class Deferred<T> {
	promise: Promise<T>
	resolve!: (value: T | PromiseLike<T>) => void
	reject!: (reason: any | PromiseLike<any>) => void
	pending = true

	constructor() {
		this.promise = new Promise((resolve, reject) => {
			this.resolve = (value) => {
				this.pending = false
				resolve(value)
			}
			this.reject = (reason) => {
				this.pending = false
				reject(reason)
			}
		})
	}
}

export class Notify {
	#next = new Deferred<void>()

	broadcast() {
		this.#next.resolve()
		this.#next = new Deferred<void>()
	}

	close(e: any) {
		this.#next.reject(e)
	}

	async wait() {
		await this.#next.promise
	}
}
