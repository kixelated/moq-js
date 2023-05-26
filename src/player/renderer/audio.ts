import { Ring } from "./ring"
import * as Message from "../message"
import Frame from "../frame"

export default class Audio {
	ring?: Ring
	queue: Array<AudioData>

	interval?: number
	last?: number // the timestamp of the last rendered frame, in microseconds

	constructor(_config: Message.Config) {
		this.queue = []
	}

	push(_frame: Frame) {
		// TODO
	}

	render(frame: AudioData) {
		// Drop any old frames
		if (this.last && frame.timestamp <= this.last) {
			frame.close()
			return
		}

		// Insert the frame into the queue sorted by timestamp.
		if (this.queue.length > 0 && this.queue[this.queue.length - 1].timestamp <= frame.timestamp) {
			// Fast path because we normally append to the end.
			this.queue.push(frame)
		} else {
			// Do a full binary search
			let low = 0
			let high = this.queue.length

			while (low < high) {
				const mid = (low + high) >>> 1
				if (this.queue[mid].timestamp < frame.timestamp) low = mid + 1
				else high = mid
			}

			this.queue.splice(low, 0, frame)
		}

		this.emit()
	}

	emit() {
		const ring = this.ring
		if (!ring) {
			return
		}

		while (this.queue.length) {
			const frame = this.queue[0]
			if (ring.size() + frame.numberOfFrames > ring.capacity) {
				// Buffer is full
				break
			}

			const size = ring.write(frame)
			if (size < frame.numberOfFrames) {
				throw new Error("audio buffer is full")
			}

			this.last = frame.timestamp

			frame.close()
			this.queue.shift()
		}
	}

	play(_play: Message.Play) {
		// TODO
	}
}
