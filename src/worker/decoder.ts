import * as MP4 from "../shared/mp4"
import { Object } from "../transport"
import * as Timeline from "./timeline"

import { Deferred } from "../shared/async"

// Decoder receives a QUIC stream, parsing the MP4 container, and passing samples to the Timeline.
export class Decoder {
	#timeline: Timeline.Sync
	#info = new Deferred<MP4.Info>()
	#raw: MP4.ArrayBuffer[] = []

	constructor(timeline: Timeline.Sync) {
		this.#timeline = timeline
	}

	async info(): Promise<MP4.Info> {
		return this.#info.promise
	}

	async receive(header: Object.Header, stream: ReadableStream) {
		if (header.track === 0n) {
			await this.#catalog(header, stream)
		} else {
			await this.#segment(header, stream)
		}
	}

	async #catalog(header: Object.Header, stream: ReadableStream) {
		try {
			// NOTE: We can't use Stream.Reader here until Workers support BYOB readers
			// TODO file a bug
			const reader = stream.getReader()
			let offset = 0

			const mp4 = MP4.New()

			mp4.onReady = (info: MP4.Info) => {
				this.#info.resolve(info)
			}

			mp4.onError = (err) => {
				throw new Error(err)
			}

			for (;;) {
				const { value, done } = await reader.read()
				if (done) break

				// Unfortunately, we need to make a copy of each chunk.
				// TODO this is a hack to get around the fact that MP4Box doesn't support Uint8Array
				const copy = new Uint8Array(value.buffer)

				// For some reason we need to modify the underlying ArrayBuffer with offset
				const buf = copy.buffer as MP4.ArrayBuffer
				buf.fileStart = offset
				this.#raw.push(buf)

				// Parse the data
				offset = mp4.appendBuffer(buf)
				mp4.flush()
			}

			if (this.#info.pending) {
				throw new Error("incomplete catalog")
			}
		} catch (err) {
			this.#info.reject(err)
		}
	}

	async #segment(header: Object.Header, stream: ReadableStream) {
		// Wait until we have parsed the info.
		const info = await this.#info.promise

		const mp4 = MP4.New()

		mp4.onError = (err) => {
			throw new Error(err)
		}

		mp4.onSamples = (_track_id: number, track: MP4.Track, samples: MP4.Sample[]) => {
			for (const sample of samples) {
				const frame = {
					track,
					sample,
					timestamp: sample.dts / track.timescale, // TODO don't convert to seconds for better accuracy
				}

				this.#timeline.push(frame)
			}
		}

		// Unfortunately we need to parse the init segment again because of the MP4Box API.
		// TODO you should optimize this before shipping.
		let offset = 0
		for (const chunk of this.#raw) {
			// Parse the data
			mp4.appendBuffer(chunk)
			mp4.flush()

			offset += chunk.byteLength
		}

		// Extract all of the tracks, because we don't know if it's audio or video.
		// TODO extract just the track based on Object.Header?
		for (const track of info.tracks) {
			mp4.setExtractionOptions(track.id, track, { nbSamples: 1 })
		}

		mp4.start()

		const reader = stream.getReader()

		for (;;) {
			const { value, done } = await reader.read()
			if (done) break

			const copy = new Uint8Array(value)

			// For some reason we need to modify the underlying ArrayBuffer with offset
			const buffer = copy.buffer as MP4.ArrayBuffer
			buffer.fileStart = offset

			// Parse the data
			mp4.appendBuffer(buffer)
			mp4.flush()

			offset += buffer.byteLength
		}
	}
}
