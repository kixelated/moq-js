import * as Message from "../message"

import Track from "./track"
import Renderer from "../renderer"

import Frame from "../frame"

// Timeline receives samples, buffering them, and pushing them to Renderer with a display timestamp.
export default class Timeline {
	// Samples are pushed to the renderer with a timestamp.
	private renderer: Renderer

	// A map of track IDs to tracks.
	private tracks: Map<number, Track>

	// The play message, if it has been received but the conditions have not been met yet.
	private playMsg?: Message.Play

	// Construct a timeline
	constructor(renderer: Renderer) {
		this.tracks = new Map()
		this.renderer = renderer
	}

	push(frame: Frame) {
		// track: MP4.Track, samples: MP4.Sample[]) {
		let track = this.tracks.get(frame.track.id)
		if (!track) {
			track = new Track(this.renderer, frame.track)
			this.tracks.set(frame.track.id, track)
		}

		track.push(frame)

		// Try to start playback when we get new samples.
		this.tryPlay()
	}

	// Start playback once the conditions have been met
	play(play: Message.Play) {
		// If we can't start playback immediately, save the message and retry.
		this.playMsg = play
		this.tryPlay()
	}

	// Try starting playback if the conditions are met.
	private tryPlay() {
		if (!this.playMsg) return
		if (!this.tracks.size) return

		let timestamp

		// Check that every track has the required minimum buffer size.
		const minBuffer = this.playMsg.minBuffer

		for (const [_track_id, track] of this.tracks) {
			const buffered = track.buffered()
			if (buffered[1] - buffered[0] < minBuffer) {
				return
			}

			// Start latency units from the end.
			const target = buffered[1] - minBuffer

			// Use the smallest timestamp for all tracks.
			if (!timestamp || target < timestamp) {
				timestamp = target
			}
		}

		const sync = performance.now() / 1000 - timestamp!
		for (const [_track_id, track] of this.tracks) {
			track.play(timestamp!, sync)
		}

		this.playMsg = undefined // we did it
	}
}
