export function decode(str: string): Uint8Array {
	const bytes = new Uint8Array(str.length / 2)
	for (let i = 0; i < bytes.length; i += 1) {
		bytes[i] = parseInt(str.slice(2 * i, 2 * i + 2), 16)
	}
	return bytes
}

export function encode(bytes: Uint8Array): string {
	throw "todo"
}
