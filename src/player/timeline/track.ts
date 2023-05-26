import * as MP4 from "../../mp4"

import Renderer from "../renderer"
import Frame from "../frame"
import * as Time from "../time"

export default class Track {
	info: MP4.Track
	renderer: Renderer

	// A queue of frames sorted by timestamp with the maximum capacity.
	queue: Array<Frame>
	capacity: number

	// The next sample that we should push to the renderer.
	next?: number

	// The wall clock timestamp for the PTS=0, used to convert between units.
	sync?: number

	constructor(renderer: Renderer, info: MP4.Track) {
		this.renderer = renderer
		this.info = info
		this.capacity = 10 // 10s default
		this.queue = []
	}

	push(frame: Frame) {
		if (!this.queue.length) {
			// Empty queue is ez.
			this.queue.push(frame)
		} else {
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
				const index = Time.search(this.queue, frame.timestamp)
				this.queue.splice(index, 0, frame)

				if (this.next && this.next >= index) this.next += 1
			}

			// Drop samples until the queue is within capacity.
			while (this.queue[0].timestamp + this.capacity < last.timestamp) {
				this.queue.shift()
				if (this.next) this.next -= 1
			}
		}
	}

	play(start: number, sync: number) {
		// Find the frame for this timestamp, and keep seeking backwards until a keyframe.
		let index = Time.search(this.queue, start)
		while (index > 0 && !this.queue[index].sample.is_sync) {
			index -= 1
		}

		this.next = index
		this.sync = sync

		this.flush()
	}

	flush() {
		if (!this.next || !this.sync) return

		const frames = this.queue.slice(this.next)
		for (const frame of frames) {
			// Make a copy of the frame with the timestamp relative to the wall clock.
			const clone = { ...frame }
			clone.timestamp += this.sync

			this.renderer.push(clone)
			this.next += 1
		}
	}

	buffered(): [number, number] {
		if (!this.queue.length) {
			return [0, 0]
		}

		const first = this.queue[0]
		const last = this.queue[this.queue.length - 1]

		return [first.timestamp, last.timestamp]
	}
}
