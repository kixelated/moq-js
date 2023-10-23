import { Source } from "./source"
import { Init } from "./init"
import * as MP4 from "../../media/mp4"

// Manage a segment download, keeping a buffer of a single sample to potentially rewrite the duration.
export class Segment {
	source: Source // The SourceBuffer used to decode media.
	offset: number // The byte offset in the received file so far
	samples: MP4.Sample[] // The samples ready to be flushed to the source.
	init: Init

	sequence: number // The order within the track
	dts?: number // The parsed DTS of the first sample
	timescale?: number // The parsed timescale of the segment

	output: MP4.ISOFile // MP4Box file used to write the outgoing atoms after modification.

	done: boolean // The segment has been completed

	constructor(source: Source, init: Init, sequence: number) {
		this.source = source
		this.offset = 0
		this.done = false
		this.init = init
		this.sequence = sequence

		this.output = MP4.New()
		this.samples = []

		// We have to reparse the init segment to work with mp4box
		for (let i = 0; i < init.raw.length; i += 1) {
			// Populate the output with our init segment so it knows about tracks
			this.output.appendBuffer(init.raw[i])
		}

		this.output.flush()
	}

	push(sample: MP4.Sample) {
		if (this.dts === undefined) {
			this.dts = sample.dts
			this.timescale = sample.timescale
		}

		// Add the samples to a queue
		this.samples.push(sample)
	}

	// Flushes any pending samples, returning true if the stream has finished.
	flush(): boolean {
		const stream = new MP4.Stream(new ArrayBuffer(0), 0, false) // big-endian

		while (this.samples.length) {
			// Keep a single sample if we're not done yet
			if (!this.done && this.samples.length < 2) break

			const sample = this.samples.shift()
			if (!sample) break

			const moof = this.output.createSingleSampleMoof(sample)
			moof.write(stream)

			// adjusting the data_offset now that the moof size is known
			// TODO find a better way to do this or remove it?
			const trun = moof.trafs[0].truns[0]
			if (trun.data_offset_position && moof.size) {
				trun.data_offset = moof.size + 8 // 8 is mdat header
				stream.adjustUint32(trun.data_offset_position, trun.data_offset)
			}

			const mdat = new MP4.BoxParser.mdatBox()
			mdat.data = sample.data
			mdat.write(stream)
		}

		this.source.initialize(this.init)
		this.source.append(stream.buffer)

		return this.done
	}

	// The segment has completed
	finish() {
		this.done = true
		this.flush()

		// Trim the buffer to 30s long after each segment.
		this.source.trim(30)
	}

	// Extend the last sample so it reaches the provided timestamp
	skipTo(pts: number) {
		if (this.samples.length == 0) return
		const last = this.samples[this.samples.length - 1]

		const skip = pts - (last.dts + last.duration)

		if (skip == 0) return
		if (skip < 0) throw "can't skip backwards"

		last.duration += skip

		if (this.timescale) {
			console.warn("skipping video", skip / this.timescale)
		}
	}

	buffered() {
		// Ignore if we have a single sample
		if (this.samples.length <= 1) return undefined
		if (!this.timescale) return undefined

		const first = this.samples[0]
		const last = this.samples[this.samples.length - 1]

		return {
			length: 1,
			start: first.dts / this.timescale,
			end: (last.dts + last.duration) / this.timescale,
		}
	}
}
