import * as Message from "./message"
import * as MP4 from "../mp4"
import * as Stream from "../stream"

import Timeline from "./timeline"
import Deferred from "../util/deferred"

// Decoder receives a QUIC stream, parsing the MP4 container, and passing samples to the Timeline.
export default class Decoder {
	timeline: Timeline
	moov: Deferred<MP4.ArrayBuffer[]>
	group: number

	constructor(timeline: Timeline) {
		this.moov = new Deferred()
		this.timeline = timeline
		this.group = 0
	}

	async init(msg: Message.Init) {
		const init = new Array<MP4.ArrayBuffer>()
		let offset = 0

		const stream = new Stream.Reader(msg.reader, msg.buffer)
		for (;;) {
			const data = await stream.read()
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

		this.moov.resolve(init)
	}

	async segment(msg: Message.Segment) {
		// Compute a unique ID for the group
		const group = this.group
		this.group += 1

		// Wait for the init segment to be fully received and parsed
		const input = MP4.New()

		input.onSamples = (_track_id: number, track: MP4.Track, samples: MP4.Sample[]) => {
			for (const sample of samples) {
				const timestamp = sample.dts / track.timescale
				this.timeline.push({
					group,
					track,
					timestamp,
					sample,
				})
			}
		}

		input.onReady = (info: MP4.Info) => {
			// Extract all of the tracks, because we don't know if it's audio or video.
			for (const track of info.tracks) {
				input.setExtractionOptions(track.id, track, { nbSamples: 1 })
			}

			input.start()
		}

		// MP4box requires us to parse the init segment for each segment unfortunately
		// TODO If this sees production usage, I would recommend caching this somehow.
		let offset = 0

		const moov = await this.moov.promise
		for (const raw of moov) {
			offset = input.appendBuffer(raw)
		}

		const stream = new Stream.Reader(msg.reader, msg.buffer)

		// For whatever reason, mp4box doesn't work until you read an atom at a time.
		while (!(await stream.done())) {
			const raw = await stream.peek(4)

			// TODO this doesn't support when size = 0 (until EOF) or size = 1 (extended size)
			const size = new DataView(raw.buffer, raw.byteOffset, raw.byteLength).getUint32(0)
			const atom = await stream.bytes(size)

			// Make a copy of the atom because mp4box only accepts an ArrayBuffer unfortunately
			const box = new Uint8Array(atom.byteLength)
			box.set(atom)

			// and for some reason we need to modify the underlying ArrayBuffer with offset
			const buffer = box.buffer as MP4.ArrayBuffer
			buffer.fileStart = offset

			// Parse the data
			offset = input.appendBuffer(buffer)
			input.flush()
		}
	}
}
