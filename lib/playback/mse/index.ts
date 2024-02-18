import { Source } from "./source"
import { Segment } from "./segment"
import { Track } from "./track"
import * as MP4 from "../../media/mp4"
import * as Message from "../backend"
import { GroupReader } from "../../transport/objects"
import { Deferred } from "../../common/async"

export interface PlayerConfig {
	element: HTMLVideoElement
}

export default class Player {
	#source: MediaSource

	// A map of init tracks.
	#inits = new Map<string, Deferred<Uint8Array>>()

	#audio: Track
	#video: Track

	#element: HTMLVideoElement
	#interval: number

	constructor(config: PlayerConfig) {
		this.#element = config.element

		this.#source = new MediaSource()
		this.#element.src = URL.createObjectURL(this.#source)
		this.#element.addEventListener("play", () => {
			this.play().catch(console.warn)
		})

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

	// Seek to the end and then play
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
		let init = this.#inits.get(msg.name)
		if (!init) {
			init = new Deferred()
			this.#inits.set(msg.name, init)
		}

		init.resolve(msg.data)
	}

	segment(msg: Message.Segment) {
		this.#runSegment(msg).catch((e) => console.warn("failed to run segment", e))
	}

	async #runSegment(msg: Message.Segment) {
		let init = this.#inits.get(msg.init)
		if (!init) {
			init = new Deferred()
			this.#inits.set(msg.init, init)
		}

		const container = new MP4.Parser(await init.promise)

		let track: Track
		if (container.info.videoTracks.length) {
			track = this.#video
		} else {
			track = this.#audio
		}

		const header = msg.header
		const stream = new GroupReader(msg.stream)

		const segment = new Segment(track.source, await init.promise, header.group)
		track.add(segment)

		for (;;) {
			const chunk = await stream.chunk()
			if (!chunk) {
				break
			}

			const frames = container.decode(chunk.payload)
			for (const frame of frames) {
				segment.push(frame.sample)
			}

			track.flush()
		}

		segment.finish()
	}

	close() {
		clearInterval(this.#interval)
	}
}
