import * as MP4 from "./index"

// Decode a MP4 container into individual samples.
export class Parser {
	#mp4 = MP4.New()
	#offset = 0

	// TODO Parser should extend TransformStream
	decode: TransformStream<Uint8Array, [MP4.Track, MP4.Sample]>

	constructor() {
		this.decode = new TransformStream({
			start: this.#start.bind(this),
			transform: this.#transform.bind(this),
			flush: this.#flush.bind(this),
		})
	}

	#start(controller: TransformStreamDefaultController<[MP4.Track, MP4.Sample]>) {
		this.#mp4.onError = (err) => {
			controller.error(err)
		}

		this.#mp4.onReady = (info: MP4.Info) => {
			// Extract all of the tracks, because we don't know if it's audio or video.
			for (const track of info.tracks) {
				this.#mp4.setExtractionOptions(track.id, track, { nbSamples: 1 })
			}
		}

		this.#mp4.onSamples = (_track_id: number, track: MP4.Track, samples: MP4.Sample[]) => {
			for (const sample of samples) {
				controller.enqueue([track, sample])
			}
		}

		this.#mp4.start()
	}

	#transform(chunk: Uint8Array) {
		const copy = new Uint8Array(chunk)

		// For some reason we need to modify the underlying ArrayBuffer with offset
		const buffer = copy.buffer as MP4.ArrayBuffer
		buffer.fileStart = this.#offset

		// Parse the data
		this.#mp4.appendBuffer(buffer)
		this.#mp4.flush()

		this.#offset += buffer.byteLength
	}

	#flush() {
		this.#mp4.flush()
	}
}
