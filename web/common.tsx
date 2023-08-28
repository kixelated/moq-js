import { Accessor, batch, createEffect, createMemo, createSignal, untrack } from "solid-js"

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

export function isCallable<T>(value: any): value is () => T {
	return typeof value === "function"
}

// An object where all values are Accessors.
type AccessorItems<T> = {
	[K in keyof T]: () => T[K]
}

// An object where none of the values are nullable.
type NonNullableItems<T> = {
	[K in keyof T]: NonNullable<T[K]>
}

// Convert an object of accessors into an accessor of an object, only if all accessors are truthy.
export function createPack<T>(items: AccessorItems<T>): Accessor<NonNullableItems<T> | undefined> {
	const result = createMemo(() => {
		const result: Partial<NonNullableItems<T>> = {}

		for (const key in items) {
			const value = items[key as keyof T]()
			if (!value) return undefined

			result[key as keyof T] = value
		}

		return result as NonNullableItems<T>
	})

	return result
}

export function createSource<S, T>(
	f: (v: NonNullable<S>) => T,
	source: Accessor<S | undefined>,
): Accessor<T | undefined> {
	const result = createMemo(() => {
		const value = source()
		if (value) return f(value)
	})

	return result
}
