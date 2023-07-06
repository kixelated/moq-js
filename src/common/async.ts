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

export class Watch<T> {
	#current: T
	#next = new Deferred<T | undefined>()

	constructor(init: T) {
		this.#current = init
	}

	current(): T {
		return this.#current
	}

	async next(): Promise<T | undefined> {
		return this.#next.promise
	}

	update(v: T | ((v: T) => T)) {
		// If we're given a function, call it with the current value
		if (v instanceof Function) {
			v = v(this.#current)
		}

		this.#current = v
		this.#next.resolve(this.#current)
		this.#next = new Deferred()
	}

	close() {
		this.#next.resolve(undefined)
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
		const q = this.#watch.current()
		if (q.length > 0) {
			return q.shift()
		}

		const r = await this.#watch.next()
		if (!r) return undefined

		return r.shift()
	}

	// Returns the entire queue on each update.
	async next(): Promise<T[] | undefined> {
		return this.#watch.next()
	}

	current(): T[] {
		return this.#watch.current()
	}

	close() {
		this.#watch.close()
	}
}

export class Notify {
	#watch = new Watch<void>(undefined)

	async next(): Promise<void> {
		return this.#watch.next()
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
		const queue = this.#queue.current()
		for (const v of queue) yield v

		let index = queue.length

		for (;;) {
			index = Math.max(0, index - this.#skip)

			const queue = await this.#queue.next()
			if (!queue) return

			for (const v of queue.slice(index)) yield v
			index = this.#skip + queue.length
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
