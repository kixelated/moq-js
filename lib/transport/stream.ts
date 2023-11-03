const MAX_U6 = Math.pow(2, 6) - 1
const MAX_U14 = Math.pow(2, 14) - 1
const MAX_U30 = Math.pow(2, 30) - 1
const MAX_U31 = Math.pow(2, 31) - 1
const MAX_U53 = Number.MAX_SAFE_INTEGER
const MAX_U62: bigint = 2n ** 62n - 1n

// Reader wraps a stream and provides convience methods for reading pieces from a stream
export class Reader {
	#reader: ReadableStream<Uint8Array>
	#scratch: Uint8Array

	constructor(reader: ReadableStream<Uint8Array>) {
		this.#reader = reader
		this.#scratch = new Uint8Array(8)
	}

	async readAll(): Promise<Uint8Array> {
		const reader = this.#reader.getReader()
		let buf = new Uint8Array(0)

		for (;;) {
			const { value, done } = await reader.read()
			if (done) break

			if (buf.byteLength > 0) {
				const append = new Uint8Array(buf.byteLength + value.byteLength)
				append.set(buf)
				append.set(value, buf.byteLength)
				buf = append
			} else {
				buf = value
			}
		}

		reader.releaseLock()

		return buf
	}

	async readExact(size: number): Promise<Uint8Array> {
		const dst = new Uint8Array(size)
		return this.read(dst, 0, size)
	}

	async read(dst: Uint8Array, offset: number, size: number): Promise<Uint8Array> {
		const reader = this.#reader.getReader({ mode: "byob" })

		while (offset < size) {
			const empty = new Uint8Array(dst.buffer, dst.byteOffset + offset, size - offset)
			const { value, done } = await reader.read(empty)
			if (done) {
				throw new Error(`short buffer`)
			}

			dst = new Uint8Array(value.buffer, value.byteOffset - offset)
			offset += value.byteLength
		}

		reader.releaseLock()

		console.log("read", dst)

		return dst
	}

	async string(maxLength?: number): Promise<string> {
		const length = await this.u53()
		if (maxLength !== undefined && length > maxLength) {
			throw new Error(`string length ${length} exceeds max length ${maxLength}`)
		}

		const buffer = await this.readExact(length)
		return new TextDecoder().decode(buffer)
	}

	async u8(): Promise<number> {
		this.#scratch = await this.read(this.#scratch, 0, 1)
		return this.#scratch[0]
	}

	async i32(): Promise<number> {
		this.#scratch = await this.read(this.#scratch, 0, 4)
		const view = new DataView(this.#scratch.buffer, this.#scratch.byteOffset, 4)
		return view.getInt32(0)
	}

	// Returns a Number using 53-bits, the max Javascript can use for integer math
	async u53(): Promise<number> {
		const v = await this.u62()
		if (v > MAX_U53) {
			throw new Error("value larger than 53-bits; use v62 instead")
		}

		return Number(v)
	}

	// NOTE: Returns a bigint instead of a number since it may be larger than 53-bits
	async u62(): Promise<bigint> {
		this.#scratch = await this.read(this.#scratch, 0, 1)
		const first = this.#scratch[0]

		const size = (first & 0xc0) >> 6

		if (size == 0) {
			return BigInt(first) & 0x3fn
		} else if (size == 1) {
			this.#scratch = await this.read(this.#scratch, 1, 2)
			const view = new DataView(this.#scratch.buffer, 0, 2)

			return BigInt(view.getInt16(0)) & 0x3fffn
		} else if (size == 2) {
			this.#scratch = await this.read(this.#scratch, 1, 4)
			const view = new DataView(this.#scratch.buffer, 0, 4)

			return BigInt(view.getUint32(0)) & 0x3fffffffn
		} else if (size == 3) {
			this.#scratch = await this.read(this.#scratch, 1, 8)
			const view = new DataView(this.#scratch.buffer, 0, 8)

			return view.getBigUint64(0) & 0x3fffffffffffffffn
		} else {
			throw new Error("impossible")
		}
	}
}

// Writer wraps a stream and writes chunks of data
export class Writer {
	#writer: WritableStream<Uint8Array>
	#scratch: Uint8Array

	constructor(writer: WritableStream<Uint8Array>) {
		this.#scratch = new Uint8Array(8)
		this.#writer = writer
	}

	async u8(v: number) {
		await this.write(setUint8(this.#scratch, v))
	}

	async i32(v: number) {
		if (Math.abs(v) > MAX_U31) {
			throw new Error(`overflow, value larger than 32-bits: ${v}`)
		}

		// We don't use a VarInt, so it always takes 4 bytes.
		// This could be improved but nothing is standardized yet.
		await this.write(setInt32(this.#scratch, v))
	}

	async u53(v: number) {
		if (v < 0) {
			throw new Error(`underflow, value is negative: ${v}`)
		} else if (v > MAX_U53) {
			throw new Error(`overflow, value larger than 53-bits: ${v}`)
		}

		await this.write(setVint53(this.#scratch, v))
	}

	async u62(v: bigint) {
		if (v < 0) {
			throw new Error(`underflow, value is negative: ${v}`)
		} else if (v >= MAX_U62) {
			throw new Error(`overflow, value larger than 62-bits: ${v}`)
		}

		await this.write(setVint62(this.#scratch, v))
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
		await this.u53(data.byteLength)
		await this.write(data)
	}
}

function setUint8(dst: Uint8Array, v: number): Uint8Array {
	dst[0] = v
	return dst.slice(0, 1)
}

function setUint16(dst: Uint8Array, v: number): Uint8Array {
	const view = new DataView(dst.buffer, dst.byteOffset, 2)
	view.setUint16(0, v)

	return new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
}

function setInt32(dst: Uint8Array, v: number): Uint8Array {
	const view = new DataView(dst.buffer, dst.byteOffset, 4)
	view.setInt32(0, v)

	return new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
}

function setUint32(dst: Uint8Array, v: number): Uint8Array {
	const view = new DataView(dst.buffer, dst.byteOffset, 4)
	view.setUint32(0, v)

	return new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
}

function setVint53(dst: Uint8Array, v: number): Uint8Array {
	if (v <= MAX_U6) {
		return setUint8(dst, v)
	} else if (v <= MAX_U14) {
		return setUint16(dst, v | 0x4000)
	} else if (v <= MAX_U30) {
		return setUint32(dst, v | 0x80000000)
	} else if (v <= MAX_U53) {
		return setUint64(dst, BigInt(v) | 0xc000000000000000n)
	} else {
		throw new Error(`overflow, value larger than 53-bits: ${v}`)
	}
}

function setVint62(dst: Uint8Array, v: bigint): Uint8Array {
	if (v < MAX_U6) {
		return setUint8(dst, Number(v))
	} else if (v < MAX_U14) {
		return setUint16(dst, Number(v) | 0x4000)
	} else if (v <= MAX_U30) {
		return setUint32(dst, Number(v) | 0x80000000)
	} else if (v <= MAX_U62) {
		return setUint64(dst, BigInt(v) | 0xc000000000000000n)
	} else {
		throw new Error(`overflow, value larger than 62-bits: ${v}`)
	}
}

function setUint64(dst: Uint8Array, v: bigint): Uint8Array {
	const view = new DataView(dst.buffer, dst.byteOffset, 8)
	view.setBigUint64(0, v)

	return new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
}
