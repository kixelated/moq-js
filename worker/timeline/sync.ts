import { MP4 } from "~/shared"

import { Component } from "./component"
import { Frame } from "./frame"
import { Range } from "./range"

export class Sync {
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

		// Return the first and last sample in both component queues.
		const combined = this.span()
		const audio = this.audio.span()
		const video = this.video.span()

		// Set our timestamp to be relative to the max value we have buffered.
		const min = combined || audio || video
		if (!min) return

		// NOTE: This could be in an unbuffered range.
		// Make sure both components are buffered enough before actually playing.
		if (!combined || combined.end - combined.start < this.#target) return

		// Set the timestamp to be relative to the end.
		const timestamp = min.end - this.#target
		this.seek(timestamp)

		this.#target = undefined // we did it
	}
}
