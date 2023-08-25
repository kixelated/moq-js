export class Deferred<T> {
	promise: Promise<T>
	resolve!: (value: T | PromiseLike<T>) => void
	reject!: (reason: any) => void
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

export type WatchNext<T> = [T, Promise<WatchNext<T>> | undefined]

export class Watch<T> {
	#current: WatchNext<T>
	#next = new Deferred<WatchNext<T>>()

	constructor(init: T) {
		this.#next = new Deferred<WatchNext<T>>()
		this.#current = [init, this.#next.promise]
	}

	value(): WatchNext<T> {
		return this.#current
	}

	update(v: T | ((v: T) => T)) {
		if (!this.#next.pending) {
			throw new Error("already closed")
		}

		// If we're given a function, call it with the current value
		if (v instanceof Function) {
			v = v(this.#current[0])
		}

		const next = new Deferred<WatchNext<T>>()
		this.#current = [v, next.promise]
		this.#next.resolve(this.#current)
		this.#next = next
	}

	close() {
		this.#current[1] = undefined
		this.#next.resolve(this.#current)
	}
}

// Wakes up a multiple consumers.
export class Notify {
	#next = new Deferred<void>()

	async wait() {
		return this.#next.promise
	}

	wake() {
		if (!this.#next.pending) {
			throw new Error("closed")
		}

		this.#next.resolve()
		this.#next = new Deferred<void>()
	}

	close() {
		this.#next.resolve()
	}
}

// Allows queuing N values, like a Channel.
export class Queue<T> {
	#stream: TransformStream<T, T>
	#reader: ReadableStreamDefaultReader<T>
	#writer: WritableStreamDefaultWriter<T>

	constructor(capacity = 1) {
		const queue = new CountQueuingStrategy({ highWaterMark: capacity })
		this.#stream = new TransformStream({}, undefined, queue)
		this.#reader = this.#stream.readable.getReader()
		this.#writer = this.#stream.writable.getWriter()
	}

	async push(v: T) {
		await this.#writer.write(v)
	}

	async next(): Promise<T | undefined> {
		const { value, done } = await this.#reader.read()
		if (done) return
		return value
	}

	async abort(err: Error) {
		return this.#writer.abort(err)
	}

	async close() {
		return this.#writer.close()
	}
}
