import * as MP4 from "../../mp4"

import { Component } from "./component"
import { Frame } from "./frame"

export class Sync {
	audio: Component
	video: Component

	// The play message, if it has been received but the conditions have not been met yet.
	private targetLatency?: number

	// Construct a timeline
	constructor() {
		this.audio = new Component()
		this.video = new Component()
	}

	push(frame: Frame) {
		const component = MP4.isAudioTrack(frame.track) ? this.audio : this.video
		component.push(frame)

		// Try to start playback when we get new samples.
		this.tryPlay()
	}

	// Start playback once the conditions have been met
	play(targetLatency: number) {
		// If we can't start playback immediately, save the message and retry.
		this.targetLatency = targetLatency
		this.tryPlay()
	}

	// Try starting playback if the conditions are met.
	private tryPlay() {
		if (this.targetLatency === undefined) return

		// Return the first and last sample in both component queues.
		const audio = this.audio.span()
		const video = this.video.span()
		if (!audio || !video) return

		// Make sure both components are buffered enough.
		if (audio.end - audio.start < this.targetLatency) return
		if (video.end - video.start < this.targetLatency) return

		// Start back target from the desired timestamp.
		// NOTE: This could be in an unbuffered range.
		const timestamp = Math.min(audio.end - this.targetLatency, video.end - this.targetLatency)

		const sync = performance.now() / 1000 - timestamp
		this.video.play(timestamp, sync)

		this.targetLatency = undefined // we did it
	}
}
