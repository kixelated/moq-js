import { Frame } from "./frame"
import { search } from "./sort"
import { Range } from "./range"

export class Component {
	// A queue of frames sorted by timestamp with the maximum capacity.
	private queue: Array<Frame>
	private capacity: number

	// The next sample that we should push to the renderer.
	private index?: number

	// The wall clock timestamp for the PTS=0, used to convert between units.
	start?: number

	constructor() {
		this.capacity = 10 // 10s default
		this.queue = []
	}

	push(frame: Frame) {
		// Empty queue is ez.
		if (!this.queue.length) this.queue.push(frame)

		// Get the last sample in the queue.
		const last = this.queue[this.queue.length - 1]

		// Drop the old sample immediately if the queue is full.
		if (frame.timestamp + this.capacity < last.timestamp) return

		// Insert the frame into the queue sorted by timestamp.
		if (last.timestamp <= frame.timestamp) {
			// Fast path because we normally append to the end.
			this.queue.push(frame)
		} else {
			// Find the index (binary search) and insert the sample.
			const index = search(this.queue, frame.timestamp)
			this.queue.splice(index, 0, frame)

			if (this.index && this.index >= index) this.index += 1
		}

		// Drop samples until the queue is within capacity.
		while (this.queue[0].timestamp + this.capacity < last.timestamp) {
			this.queue.shift()
			if (this.index) this.index -= 1
		}
	}

	play(start: number, sync: number) {
		// Find the frame for this timestamp, and keep seeking backwards until a keyframe.
		let index = search(this.queue, start)
		while (index > 0 && !this.queue[index].sample.is_sync) {
			index -= 1
		}

		this.index = index
		this.start = sync
	}

	next(): Frame | undefined {
		// Not playing yet
		if (this.index === undefined) return

		// Nothing in the queue
		if (this.index >= this.queue.length) return

		// Get the next frame to render.
		const frame = this.queue[this.index]
		this.index += 1

		return frame
	}

	// Conversion from PTS to wall clock time.
	sync(pts: number): number {
		if (!this.start) throw new Error("timeline not playing")
		return this.start + pts
	}

	// Returns the first and last frame
	span(): Range | undefined {
		if (!this.queue.length) return
		const first = this.queue[0]
		const last = this.queue[this.queue.length - 1]

		return { start: first.timestamp, end: last.timestamp }
	}
}
