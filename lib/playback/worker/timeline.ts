import type { Frame } from "../../media/mp4"
export type { Frame }

export interface Range {
	start: number
	end: number
}

export class Timeline {
	// Maintain audio and video separately
	audio: Component
	video: Component

	// Construct a timeline
	constructor() {
		this.audio = new Component()
		this.video = new Component()
	}
}

interface Segment {
	sequence: number
	timestamp?: number
	frames: ReadableStream<Frame>
}

const JITTER_BUFFER_SIZE = 200 // milliseconds

export class Component {
	#current?: Segment
	#buffer: Segment[] = []
	#jitterBufferSize: number

	frames: ReadableStream<Frame>
	#segments: TransformStream<Segment, Segment>

	constructor() {
		this.#jitterBufferSize = JITTER_BUFFER_SIZE
		this.frames = new ReadableStream({
			pull: this.#pull.bind(this),
			cancel: this.#cancel.bind(this),
		})

		// This is a hack to have an async channel with 100 items.
		this.#segments = new TransformStream({}, { highWaterMark: 100 })
	}

	get segments() {
		return this.#segments.writable
	}

	async #pull(controller: ReadableStreamDefaultController<Frame>) {
		for (;;) {
			// process buffered segments
			await this.#processBuffer()

			if (!this.#current) {
				const segments = this.#segments.readable.getReader()
				const { value: segment, done } = await segments.read()
				segments.releaseLock()

				if (done) {
					controller.close()
					return
				}

				if (segment.timestamp === undefined) {
					segment.timestamp = Date.now()
				}

				this.#buffer.push(segment)
				this.#buffer.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
			}

			// process frames from the current segment
			if (this.#current) {
				const frames = this.#current.frames.getReader()
				const { value: frame, done } = await frames.read()
				frames.releaseLock()

				if (done) {
					this.#current = undefined
					continue
				}

				controller.enqueue(frame)
				return
			}
		}
	}

	async #processBuffer() {
		while (this.#buffer.length > 0) {
			const now = Date.now()
			const oldestSegment = this.#buffer[0]
			// console.log("oldest segment", oldestSegment)
			const timeDiff = now - (oldestSegment.timestamp ?? now)
			// console.log("timeDiff", timeDiff)

			if (timeDiff > this.#jitterBufferSize) {
				// segment is old enough to process
				const currentSegment = this.#buffer.shift()

				if (!currentSegment) break

				this.#current = currentSegment

				const currentTimestamp = currentSegment.timestamp

				// cancel any older segments still in the buffer
				while (this.#buffer.length > 0 && (this.#buffer[0].timestamp ?? 0) < (currentTimestamp ?? 0)) {
					const oldSegment = this.#buffer.shift()
					await oldSegment?.frames.cancel("segment too old")
				}
				break
			} else {
				// The oldest segment is still too new, wait a bit
				await new Promise((resolve) => setTimeout(resolve, 10))
			}
		}
	}

	async #cancel(reason: any) {
		if (this.#current) {
			await this.#current.frames.cancel(reason)
		}

		const segments = this.#segments.readable.getReader()
		for (;;) {
			const { value: segment, done } = await segments.read()
			if (done) break

			await segment.frames.cancel(reason)
		}
	}
}

// Return if a type is a segment or frame
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
function isSegment(value: Segment | Frame): value is Segment {
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	return (value as Segment).frames !== undefined
}
