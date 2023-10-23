import { Source } from "./source"
import { InitParser } from "./init"
import { Segment } from "./segment"
import { Track } from "./track"
import * as MP4 from "../../media/mp4"
import * as Message from "../backend"

export interface PlayerConfig {
	element: HTMLVideoElement
}

export default class Player {
	#source: MediaSource

	#init: Map<string, InitParser>
	#audio: Track
	#video: Track

	#element: HTMLVideoElement
	#interval: number

	constructor(config: PlayerConfig) {
		this.#element = config.element

		this.#source = new MediaSource()
		this.#element.src = URL.createObjectURL(this.#source)

		this.#init = new Map()
		this.#audio = new Track(new Source(this.#source))
		this.#video = new Track(new Source(this.#source))

		this.#interval = setInterval(this.#tick.bind(this), 100)
		this.#element.addEventListener("waiting", this.#tick.bind(this))
	}

	#tick() {
		// Try skipping ahead if there's no data in the current buffer.
		this.#trySeek()

		// Try skipping video if it would fix any desync.
		this.#trySkip()
	}

	async play() {
		const ranges = this.#element.buffered
		if (!ranges.length) {
			return
		}

		this.#element.currentTime = ranges.end(ranges.length - 1)
		await this.#element.play()
	}

	// Try seeking ahead to the next buffered range if there's a gap
	#trySeek() {
		if (this.#element.readyState > 2) {
			// HAVE_CURRENT_DATA
			// No need to seek
			return
		}

		const ranges = this.#element.buffered
		if (!ranges.length) {
			// Video has not started yet
			return
		}

		for (let i = 0; i < ranges.length; i += 1) {
			const pos = ranges.start(i)

			if (this.#element.currentTime >= pos) {
				// This would involve seeking backwards
				continue
			}

			console.warn("seeking forward", pos - this.#element.currentTime)

			this.#element.currentTime = pos
			return
		}
	}

	// Try dropping video frames if there is future data available.
	#trySkip() {
		let playhead: number | undefined

		if (this.#element.readyState > 2) {
			// If we're not buffering, only skip video if it's before the current playhead
			playhead = this.#element.currentTime
		}

		this.#video.advance(playhead)
	}

	init(msg: Message.Init) {
		this.#runInit(msg).catch((e) => console.warn("failed to run init", e))
	}

	async #runInit(msg: Message.Init) {
		let init = this.#init.get(msg.name)
		if (!init) {
			init = new InitParser()
			this.#init.set(msg.name, init)
		}

		const reader = msg.stream.getReader()

		for (;;) {
			const { value, done } = await reader.read()
			if (done) break

			init.push(value)
		}
	}

	segment(msg: Message.Segment) {
		this.#runSegment(msg).catch((e) => console.warn("failed to run segment", e))
	}

	async #runSegment(msg: Message.Segment) {
		let pending = this.#init.get(msg.init)
		if (!pending) {
			pending = new InitParser()
			this.#init.set(msg.init, pending)
		}

		// Wait for the init segment to be fully received and parsed
		const init = await pending.ready

		let track: Track
		if (init.info.videoTracks.length) {
			track = this.#video
		} else {
			track = this.#audio
		}

		const segment = new Segment(track.source, init, msg.header.sequence)
		track.add(segment)

		const container = new MP4.Parser()

		// We need to reparse the init segment to work with mp4box
		const writer = container.decode.writable.getWriter()
		for (const raw of init.raw) {
			// I hate this
			await writer.write(new Uint8Array(raw))
		}
		writer.releaseLock()

		const reader = msg.stream.pipeThrough(container.decode).getReader()
		for (;;) {
			const { value, done } = await reader.read()
			if (done) break

			segment.push(value.sample)
			track.flush()
		}

		segment.finish()
	}

	close() {
		clearInterval(this.#interval)
	}
}
