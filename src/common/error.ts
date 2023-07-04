// I hate javascript
export function asError(e: any): Error {
	if (e instanceof Error) {
		return e
	}

	return new Error(typeof e === "string" ? e : e.toString())
}
