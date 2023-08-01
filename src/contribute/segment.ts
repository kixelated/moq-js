import { Chunk } from "./chunk"

export class Segment {
	id: number

	input: WritableStream<Chunk>
	#cache: ReadableStream<Uint8Array>

	expires?: number

	constructor(id: number) {
		this.id = id

		const transport = new TransformStream<Chunk, Uint8Array>({
			transform: (chunk: Chunk, controller) => {
				// Compute the new expiration based on the max timestamp
				const max = chunk.timestamp + chunk.duration

				// Convert from microseconds to milliseconds
				const ms = max / 1000

				// Expire after 10s
				this.expires = ms + 10_000

				// Push the chunk to any listeners.
				controller.enqueue(chunk.data)
			},
		})

		this.input = transport.writable
		this.#cache = transport.readable
	}

	// Split the output reader into two parts.
	chunks(): ReadableStream<Uint8Array> {
		const [tee, cache] = this.#cache.tee()
		this.#cache = cache
		return tee
	}
}
