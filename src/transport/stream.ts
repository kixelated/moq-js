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
		return this.readFull(dst)
	}

	async readFull(dst: Uint8Array): Promise<Uint8Array> {
		const reader = this.#reader.getReader({ mode: "byob" })

		let offset = 0

		while (offset < dst.byteLength) {
			const { value, done } = await reader.read(dst.slice(offset))
			if (done) {
				throw new Error(`short buffer: ${offset} < ${dst.byteLength}`)
			}

			offset += value.byteLength
			dst = new Uint8Array(value.buffer, value.byteOffset)
		}

		reader.releaseLock()

		return dst
	}

	async string(maxLength?: number): Promise<string> {
		const length = await this.vint52()
		if (maxLength !== undefined && length > maxLength) {
			throw new Error(`string length ${length} exceeds max length ${maxLength}`)
		}

		const buffer = await this.readExact(length)
		return new TextDecoder().decode(buffer)
	}

	private async view(size: number): Promise<DataView> {
		const scratch = this.#scratch.slice(0, size)
		const view = await this.readFull(scratch)
		return new DataView(view.buffer, view.byteOffset, scratch.byteLength)
	}

	async uint8(): Promise<number> {
		const view = await this.view(1)
		return view.getUint8(0)
	}

	async uint16(): Promise<number> {
		const view = await this.view(2)
		return view.getUint16(0)
	}

	async uint32(): Promise<number> {
		const view = await this.view(4)
		return view.getUint32(0)
	}

	// Returns a Number using 52-bits, the max Javascript can use for integer math
	async uint52(): Promise<number> {
		const v = await this.uint64()
		if (v > Number.MAX_SAFE_INTEGER) {
			throw new Error("value larger than 52-bits; use vint62 instead")
		}

		return Number(v)
	}

	// Returns a Number using 52-bits, the max Javascript can use for integer math
	async vint52(): Promise<number> {
		const v = await this.vint62()
		if (v > Number.MAX_SAFE_INTEGER) {
			throw new Error("value larger than 52-bits; use vint62 instead")
		}

		return Number(v)
	}

	// NOTE: Returns a bigint instead of a number since it may be larger than 52-bits
	async vint62(): Promise<bigint> {
		const scratch = await this.readFull(this.#scratch.slice(0, 1))
		const first = scratch[0]

		const size = (first & 0xc0) >> 6

		switch (size) {
			case 0: {
				return BigInt(first) & 0x3fn
			}
			case 1: {
				await this.readFull(this.#scratch.slice(1, 2))
				const view = new DataView(this.#scratch.buffer, this.#scratch.byteOffset, 2)

				const v = view.getInt16(0)
				return BigInt(v) & 0x3fffn
			}
			case 2: {
				await this.readFull(this.#scratch.slice(1, 4))
				const view = new DataView(this.#scratch.buffer, this.#scratch.byteOffset, 4)

				const v = view.getUint32(0)
				return BigInt(v) & 0x3fffffffn
			}
			case 3: {
				await this.readFull(this.#scratch.slice(1, 8))
				const view = new DataView(this.#scratch.buffer, this.#scratch.byteOffset, 8)

				const v = view.getBigUint64(0)
				return v & 0x3fffffffffffffffn
			}
			default:
				throw new Error("impossible")
		}
	}

	// NOTE: Returns a BigInt instead of a Number
	async uint64(): Promise<bigint> {
		const view = await this.view(8)
		return view.getBigUint64(0)
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
