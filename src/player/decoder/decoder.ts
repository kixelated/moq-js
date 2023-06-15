import * as MP4 from "../../mp4"
import * as Stream from "../../stream"
import { Data } from "../../transport"
import * as Timeline from "../timeline"

import { Deferred } from "../../util/deferred"

// Decoder receives a QUIC stream, parsing the MP4 container, and passing samples to the Timeline.
export class Decoder {
	#timeline: Timeline.Sync
	#moov: Deferred<MP4.File>

	constructor(timeline: Timeline.Sync) {
		this.#timeline = timeline
		this.#moov = new Deferred()
	}

	/*
	async init(buffer: Stream.Buffer) {
		console.log("received init stream")

		const init = new Array<MP4.ArrayBuffer>()
		let offset = 0

		const stream = new Stream.Reader(buffer)
		for (;;) {
			const data = await stream.chunk()
			if (!data) break

			// Make a copy of the atom because mp4box only accepts an ArrayBuffer unfortunately
			const box = new Uint8Array(data.byteLength)
			box.set(data)

			// and for some reason we need to modify the underlying ArrayBuffer with fileStart
			const buffer = box.buffer as MP4.ArrayBuffer
			buffer.fileStart = offset

			// Add the box to our queue of chunks
			init.push(buffer)

			offset += data.byteLength
		}

		console.log("received init", init)

		this.moov.resolve(init)
	}
	*/

	async receive(header: Data.Header, stream: Stream.Reader) {
		if (header.track === 0) {
			const mp4 = await this.#init(header, stream)
			this.#moov.resolve(mp4)
		} else {
			let mp4 = await this.#moov.promise
			mp4 = structuredClone(mp4)

			await this.#parse(mp4, stream)
		}
	}

	async #init(header: Data.Header, stream: Stream.Reader): Promise<MP4.File> {
		// Wait for the init segment to be fully received and parsed
		const mp4 = MP4.New()

		mp4.offset = 0

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

		mp4.onReady = (info: MP4.Info) => {
			// Extract all of the tracks, because we don't know if it's audio or video.
			for (const track of info.tracks) {
				mp4.setExtractionOptions(track.id, track, { nbSamples: 1 })
			}

			mp4.start()
		}

		await this.#parse(mp4, stream)

		return mp4
	}

	async #parse(mp4: MP4.File, stream: Stream.Reader) {
		// For whatever reason, mp4box doesn't work until you read an atom at a time.
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
			buffer.fileStart = mp4.offset!

			// Parse the data
			mp4.offset = mp4.appendBuffer(buffer)
			mp4.flush()
		}
	}
}
