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

export class Queue<T> {
	#watch = new Watch<T[]>([])

	push(v: T) {
		this.#watch.update((q) => {
			q.push(v)
			return q
		})
	}

	async shift(): Promise<T | undefined> {
		for (;;) {
			const [current, next] = this.#watch.value()
			if (current.length > 0) return current.shift()
			if (!next) return

			await next
		}
	}

	// Returns the entire queue state on each update.
	value() {
		return this.#watch.value()
	}

	close() {
		this.#watch.close()
	}
}

export class Notify {
	#watch = new Watch<void>(undefined)

	async next() {
		const [_, next] = this.#watch.value()
		return next
	}

	wake() {
		this.#watch.update(undefined)
	}

	close() {
		this.#watch.close()
	}
}

// A list of values that can be iterated over asynchronously
export class List<T> {
	#queue = new Queue<T>()
	#skip = 0

	async *get() {
		let index = 0
		for (;;) {
			index = Math.max(0, index - this.#skip)

			const [current, next] = this.#queue.value()
			for (const v of current.slice(index)) yield v
			if (!next) return

			index = this.#skip + current.length
			await next
		}
	}

	push(v: T) {
		this.#queue.push(v)
	}

	shift() {
		this.#skip += 1
		return this.#queue.shift()
	}

	close() {
		this.#queue.close()
	}
}
