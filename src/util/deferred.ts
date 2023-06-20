export class Deferred<T> {
	promise: Promise<T>
	resolve!: (value: T | PromiseLike<T>) => void
	reject!: (reason: any | PromiseLike<any>) => void
	pending = true

	constructor() {
		this.promise = new Promise((resolve, reject) => {
			this.resolve = (value: T | PromiseLike<T>) => {
				this.pending = false
				resolve(value)
			}
			this.reject = (reason: any | PromiseLike<any>) => {
				this.pending = false
				reject(reason)
			}
		})
	}
}
