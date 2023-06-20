// Reader wraps a stream and provides convience methods for reading pieces from a stream
export class Reader {
	#reader: ReadableStream
	#scratch: Uint8Array

	constructor(reader: ReadableStream) {
		this.#reader = reader
		this.#scratch = new Uint8Array(8)
	}

	async readAll(dst?: Uint8Array): Promise<Uint8Array> {
		const reader = this.#reader.getReader({ mode: "byob" })

		let buf = dst ?? new Uint8Array(1024)

		let offset = 0
		for (;;) {
			if (offset >= buf.byteLength) {
				const temp = new Uint8Array(buf.byteLength * 2)
				temp.set(buf)
				buf = temp
			}

			const { value, done } = await reader.read(buf.slice(offset))
			if (done) break

			offset += value.byteLength
			buf = new Uint8Array(value.buffer, value.byteOffset)
		}

		reader.releaseLock()

		return new Uint8Array(buf.buffer, buf.byteOffset, offset)
	}

	async readFull(dst: Uint8Array): Promise<Uint8Array> {
		const reader = this.#reader.getReader({ mode: "byob" })

		let offset = 0

		while (offset < dst.byteLength) {
			const { value, done } = await reader.read(dst.slice(offset))
			if (done) {
				throw "short buffer"
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

		let buffer = new Uint8Array(length)
		buffer = await this.readFull(buffer)

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
			throw "value larger than 52-bits; use vint62 instead"
		}

		return Number(v)
	}

	// Returns a Number using 52-bits, the max Javascript can use for integer math
	async vint52(): Promise<number> {
		const v = await this.vint62()
		if (v > Number.MAX_SAFE_INTEGER) {
			throw "value larger than 52-bits; use vint62 instead"
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
				throw "impossible"
		}
	}

	// NOTE: Returns a BigInt instead of a Number
	async uint64(): Promise<bigint> {
		const view = await this.view(8)
		return view.getBigUint64(0)
	}
}
