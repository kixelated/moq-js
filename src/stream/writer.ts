// Writer wraps a stream and writes chunks of data
export class Writer {
	#writer: WritableStream
	#scratch: Uint8Array

	constructor(writer: WritableStream) {
		this.#scratch = new Uint8Array(8)
		this.#writer = writer
	}

	async uint8(v: number) {
		await this.write(setUint8(this.#scratch, v))
	}

	async uint16(v: number) {
		await this.write(setUint16(this.#scratch, v))
	}

	async uint24(v: number) {
		await this.write(setUint24(this.#scratch, v))
	}

	async uint32(v: number) {
		await this.write(setUint32(this.#scratch, v))
	}

	async uint52(v: number) {
		await this.write(setUint52(this.#scratch, v))
	}

	async vint52(v: number) {
		await this.write(setVint52(this.#scratch, v))
	}

	async vint62(v: bigint) {
		await this.write(setVint62(this.#scratch, v))
	}

	async uint64(v: bigint) {
		await this.write(setUint64(this.#scratch, v))
	}

	async write(v: Uint8Array) {
		const writer = this.#writer.getWriter()
		try {
			await writer.write(v)
		} finally {
			writer.releaseLock()
		}
	}

	async string(str: string) {
		const data = new TextEncoder().encode(str)
		await this.vint52(data.byteLength)
		await this.write(data)
	}
}

export function setUint8(dst: Uint8Array, v: number): Uint8Array {
	if (v >= 1 << 8) {
		throw new Error(`overflow, value larger than 8-bits: ${v}`)
	}

	dst[0] = v

	return dst.slice(0, 1)
}

export function setUint16(dst: Uint8Array, v: number): Uint8Array {
	if (v >= 1 << 16) {
		throw new Error(`overflow, value larger than 16-bits: ${v}`)
	}

	const view = new DataView(dst.buffer, dst.byteOffset, 2)
	view.setUint16(0, v)

	return new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
}

export function setUint24(dst: Uint8Array, v: number): Uint8Array {
	if (v >= 1 << 24) {
		throw new Error(`overflow, value larger than 24-bits: ${v}`)
	}

	const view = new DataView(dst.buffer, dst.byteOffset, 3)

	view.setUint8(0, (v >> 16) & 0xff)
	view.setUint8(1, (v >> 8) & 0xff)
	view.setUint8(2, v & 0xff)

	return new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
}

export function setUint32(dst: Uint8Array, v: number): Uint8Array {
	if (v >= 1 << 32) {
		throw new Error(`overflow, value larger than 32-bits: ${v}`)
	}

	const view = new DataView(dst.buffer, dst.byteOffset, 4)
	view.setUint32(0, v)

	return new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
}

export function setUint52(dst: Uint8Array, v: number): Uint8Array {
	if (v > Number.MAX_SAFE_INTEGER) {
		throw new Error(`overflow, value larger than 52-bits: ${v}`)
	}

	const view = new DataView(dst.buffer, dst.byteOffset, 8)
	view.setBigUint64(0, BigInt(v))

	return new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
}

export function setVint52(dst: Uint8Array, v: number): Uint8Array {
	if (v > Number.MAX_SAFE_INTEGER) {
		throw new Error(`overflow, value larger than 52-bits: ${v}`)
	}

	if (v < 1 << 6) {
		return setUint8(dst, v)
	} else if (v < 1 << 14) {
		return setUint16(dst, v | 0x4000)
	} else if (v < 1 << 30) {
		return setUint32(dst, v | 0x80000000)
	} else {
		return setUint64(dst, BigInt(v) | 0xc000000000000000n)
	}
}

export function setVint62(dst: Uint8Array, v: bigint): Uint8Array {
	if (v < 1 << 6) {
		return setUint8(dst, Number(v))
	} else if (v < 1 << 14) {
		return setUint16(dst, Number(v) | 0x4000)
	} else if (v < 1 << 30) {
		return setUint32(dst, Number(v) | 0x80000000)
	} else if (v < 1 << 62) {
		return setUint64(dst, BigInt(v) | 0xc000000000000000n)
	} else {
		throw new Error(`overflow, value larger than 62-bits: ${v}`)
	}
}

export function setUint64(dst: Uint8Array, v: bigint): Uint8Array {
	if (v >= 1n << 64n) {
		throw new Error(`overflow, value larger than 64-bits: ${v}`)
	}

	const view = new DataView(dst.buffer, dst.byteOffset, 8)
	view.setBigUint64(0, v)

	return new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
}
