import * as MP4 from "../common/mp4"

export interface Range {
	start: number
	end: number
}

export interface Frame {
	track: MP4.Track // The track this frame belongs to
	sample: MP4.Sample // The actual sample contain the frame data
	timestamp: number // The presentation timestamp of the frame
}

export class Timeline {
	// Maintain audio and video seprarately
	audio: Component
	video: Component

	// Convert from the wall clock timestamp to the media timestamp
	#sync?: number

	// The play message, if it has been received but the conditions have not been met yet.
	#target?: number

	// A counter that increases by 1 each time there's a seek
	#continuity: number

	// Construct a timeline
	constructor() {
		this.audio = new Component()
		this.video = new Component()
		this.#continuity = 0
	}

	push(frame: Frame) {
		const component = MP4.isAudioTrack(frame.track) ? this.audio : this.video
		component.push(frame)

		// Try to start playback when we get new samples.
		this.#tryPlay()
	}

	// Start playback once the conditions have been met
	play(target: number) {
		// If we can't start playback immediately, save the message and retry.
		this.#target = target
		this.#tryPlay()
	}

	seek(timestamp: number) {
		this.#sync = performance.now() / 1000 - timestamp
		this.#continuity += 1

		this.audio.reset(timestamp)
		this.video.reset(timestamp)
	}

	// Convert a media timestamp to a wall clock timestamp.
	sync(pts: number): number | undefined {
		if (!this.#sync) return
		return pts + this.#sync
	}

	continuity(): number {
		return this.#continuity
	}

	// Return the minimum and maximum timestamp for both components.
	span(): Range | undefined {
		const audio = this.audio.span()
		const video = this.video.span()
		if (!audio || !video) return

		return {
			start: Math.max(audio.start, video.start),
			end: Math.min(audio.end, video.end),
		}
	}

	// Try starting playback if the conditions are met.
	#tryPlay() {
		if (this.#target === undefined) return

		const video = this.video.span()

		// NOTE: This could be in an unbuffered range.
		if (!video || video.end - video.start < this.#target) return

		// Set the timestamp to be relative to the end.
		const timestamp = video.end - this.#target
		this.seek(timestamp)

		this.#target = undefined // we did it
	}
}

export class Component {
	// A queue of frames sorted by timestamp with the maximum capacity.
	#queue: Frame[]
	#capacity: number

	// The next sample that we should push to the renderer.
	#index?: number

	constructor() {
		this.#capacity = 10 // 10s default
		this.#queue = []
	}

	push(frame: Frame) {
		// Empty queue is ez.
		if (!this.#queue.length) this.#queue.push(frame)

		// Get the last sample in the queue.
		const last = this.#queue[this.#queue.length - 1]

		// Drop the old sample immediately if the queue is full.
		if (frame.timestamp + this.#capacity < last.timestamp) return

		// Insert the frame into the queue sorted by timestamp.
		if (last.timestamp <= frame.timestamp) {
			// Fast path because we normally append to the end.
			this.#queue.push(frame)
		} else {
			// Find the index (binary search) and insert the sample.
			const index = findTimestamp(this.#queue, frame.timestamp)
			this.#queue.splice(index, 0, frame)

			if (this.#index && this.#index >= index) this.#index += 1
		}

		// Drop samples until the queue is within capacity.
		while (this.#queue[0].timestamp + this.#capacity < last.timestamp) {
			this.#queue.shift()
			if (this.#index) this.#index -= 1
		}
	}

	reset(timestamp: number) {
		// Find the frame for this timestamp, and keep seeking backwards until a keyframe.
		let index = findTimestamp(this.#queue, timestamp)
		if (index >= this.#queue.length) index = this.#queue.length - 1

		// Seek backwards to the nearest keyframe
		while (index > 0 && !this.#queue[index].sample.is_sync) {
			index -= 1
		}

		this.#index = index
	}

	next(): Frame | undefined {
		// Not playing yet
		if (this.#index === undefined) {
			return
		}

		// Nothing in the queue
		if (this.#index >= this.#queue.length) {
			return
		}

		// Get the next frame to render.
		const frame = this.#queue[this.#index]
		this.#index += 1

		return frame
	}

	// Returns the first and last frame
	span(): Range | undefined {
		if (!this.#queue.length) return
		const first = this.#queue[0]
		const last = this.#queue[this.#queue.length - 1]

		return { start: first.timestamp, end: last.timestamp }
	}

	ranges(): Range[] {
		if (!this.#queue.length) return []

		// Compute the minimum distance between two samples if the duration is unknown.
		let gap = Infinity
		for (let i = 1; i < this.#queue.length; i++) {
			const [prev, next] = [this.#queue[i - 1].sample, this.#queue[i].sample]
			if (prev.dts === next.dts || prev.timescale !== next.timescale) continue
			gap = Math.min(gap, next.dts - prev.dts)
		}

		if (gap === Infinity) gap = 0 // just in case

		// Start with the first sample.
		const first = this.#queue[0].sample
		const ranges = [{ start: first.dts, end: first.dts + first.duration || gap, timescale: first.timescale }]

		// Loop over every sample, merging ranges while there's no gap.
		for (const frame of this.#queue.slice(1)) {
			const sample = frame.sample
			const prev = ranges[ranges.length - 1]

			// Make sure the timescale is the same, and there's no gap.
			if (sample.dts <= prev.end && sample.timescale === prev.timescale) {
				prev.end += sample.duration || gap
			} else {
				// Otherwise, start a new range.
				ranges.push({
					start: sample.dts,
					end: sample.dts + sample.duration || gap,
					timescale: sample.timescale,
				})
			}
		}

		// Convert to seconds
		return ranges.map((range) => ({ start: range.start / range.timescale, end: range.end / range.timescale }))
	}
}

interface Timed {
	timestamp: number
}

export function findTimestamp(queue: Timed[], timestamp: number): number {
	// Do binary search
	let low = 0
	let high = queue.length

	while (low < high) {
		const mid = (low + high) >>> 1
		if (queue[mid].timestamp < timestamp) low = mid + 1
		else high = mid
	}

	return low
}
