import * as MP4 from "../../mp4"
import * as Stream from "../../stream"
import { Data } from "../../transport"
import * as Timeline from "../timeline"

import { Deferred } from "../../util/deferred"

// Decoder receives a QUIC stream, parsing the MP4 container, and passing samples to the Timeline.
export class Decoder {
	#timeline: Timeline.Sync
	#info: Deferred<MP4.Info>

	constructor(timeline: Timeline.Sync) {
		this.#timeline = timeline
		this.#info = new Deferred()
	}

	async info(): Promise<MP4.Info> {
		return this.#info.promise
	}

	async receive(header: Data.Header, stream: Stream.Reader) {
		if (header.track === 0n) {
			await this.#catalog(header, stream)
		} else {
			await this.#segment(header, stream)
		}
	}

	async #catalog(header: Data.Header, stream: Stream.Reader) {
		try {
			const raw = await stream.readAll()

			// Make a copy of the atom because mp4box only accepts an ArrayBuffer unfortunately
			const box = new Uint8Array(raw.byteLength)
			box.set(raw)

			// For some reason we need to modify the underlying ArrayBuffer with offset
			const buf = box.buffer as MP4.ArrayBuffer
			buf.fileStart = 0

			const mp4 = MP4.New()
			let done = false

			mp4.onReady = (info: MP4.Info) => {
				info.raw = buf
				this.#info.resolve(info)
				done = true
			}

			mp4.onError = (err) => {
				throw err
			}

			// Parse the data
			mp4.appendBuffer(buf)
			mp4.flush()

			if (!done) {
				throw new Error("incomplete catalog")
			}
		} catch (err) {
			this.#info.reject(err)
		}
	}

	async #segment(header: Data.Header, stream: Stream.Reader) {
		// Wait until we have parsed the info.
		const info = await this.#info.promise
		const raw = info.raw!

		const mp4 = MP4.New()

		mp4.onError = (err) => {
			throw err
		}

		mp4.onSamples = (_track_id: number, track: MP4.Track, samples: MP4.Sample[]) => {
			for (const sample of samples) {
				const frame = {
					track,
					sample,
					timestamp: sample.dts / track.timescale,
				}

				this.#timeline.push(frame)
			}
		}

		// Unfortunately we need to parse the init segment again because of the MP4Box API.
		// TODO you should optimize this before shipping.
		let offset = mp4.appendBuffer(raw)

		// Extract all of the tracks, because we don't know if it's audio or video.
		// TODO extract just the track based on Data.Header?
		for (const track of info.tracks) {
			mp4.setExtractionOptions(track.id, track, { nbSamples: 1 })
		}

		mp4.start()

		// For whatever reason, mp4box doesn't work until you read an atom at a time.
		// TODO You should optimize this before shipping
		while (!(await stream.done())) {
			const raw = await stream.peek(4)

			// TODO this doesn't support when size = 0 (until EOF) or size = 1 (extended size)
			const size = new DataView(raw.buffer, raw.byteOffset, raw.byteLength).getUint32(0)
			const atom = await stream.read(size)

			// Make a copy of the atom because mp4box only accepts an ArrayBuffer unfortunately
			const box = new Uint8Array(atom.byteLength)
			box.set(atom)

			// and for some reason we need to modify the underlying ArrayBuffer with offset
			const buffer = box.buffer as MP4.ArrayBuffer
			buffer.fileStart = offset

			// Parse the data
			offset = mp4.appendBuffer(buffer)
			mp4.flush()
		}
	}
}
