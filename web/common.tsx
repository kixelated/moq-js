import { Accessor, Setter, batch, createEffect, createSignal, untrack } from "solid-js"

export interface Fetch<S, T> {
	(): T | undefined
	loading: Accessor<boolean>
	error: Accessor<Error | undefined>
	fetch: (s: S) => void
}

// A simple reimagining of createResource that doesn't throw exceptions.
// It won't fetch until source is truthy or refetch is called, passing any provided argument to the fetcher.
export function createFetch<T, S>(
	f: (s: S) => T | Promise<T>,
	source?: S | false | null | (() => S | undefined | false | null),
): Fetch<S, T> {
	const [value, setValue] = createSignal<T | undefined>()
	const [loading, setLoading] = createSignal(false)
	const [error, setError] = createSignal<Error | undefined>()

	// Wrap fetch in a promise if it isn't already
	const fa = async (s: S) => {
		const result = f(s)
		return result instanceof Promise ? result : Promise.resolve(result)
	}

	const fetch = (s: S) => {
		// Don't track any accessors, otherwise it's pretty easy to get into an infinite loop.
		untrack(() => {
			if (loading()) return

			batch(() => {
				setValue(undefined)
				setLoading(true)
				setError(undefined)
			})

			fa(s)
				.then((v) => {
					batch(() => {
						setValue(() => v)
						setLoading(false)
						setError(undefined)
					})
				})
				.catch((err) => {
					batch(() => {
						setValue(undefined)
						setError(err)
						setLoading(false)
					})
				})
		})
	}

	if (source) {
		createEffect(() => {
			const s = isCallable(source) ? source() : source
			if (s) fetch(s)
		})
	}

	const result = value as Fetch<S, T>
	result.loading = loading
	result.error = error
	result.fetch = fetch
	return result
}

export interface Runner<T> {
	(): T | undefined
	running: Accessor<boolean>
	error: Accessor<Error | undefined>
}

// Another take on createResource, this time for long-lived async functions.
// Call .start() to start the runner, which can then call set() to update the value as many times as it wants.
// The value will be unset when the runner finishes, and the error will be set if it throws.
export function createRunner<T, S>(
	f: (set: Setter<T | undefined>, source: S) => Promise<void>,
	source?: S | false | null | (() => S | undefined | false | null),
): Runner<T> {
	const [running, setRunning] = createSignal(false)
	const [value, setValue] = createSignal<T | undefined>()
	const [error, setError] = createSignal<Error | undefined>()

	const start = (s: S) => {
		untrack(() => {
			if (running()) return

			batch(() => {
				setRunning(true)
				setValue(undefined)
				setError(undefined)
			})

			f(setValue, s)
				.catch(setError) // sets to error
				.finally(() => {
					batch(() => {
						setRunning(false)
						setValue(undefined)
					})
				})
		})
	}

	createEffect(() => {
		const s = isCallable(source) ? source() : source
		if (s) start(s)
	})

	const result = value as Runner<T>
	result.running = running
	result.error = error
	return result
}

function isCallable<T>(value: any): value is () => T {
	return typeof value === "function"
}
