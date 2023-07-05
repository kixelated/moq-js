import { Frame } from "./timeline"

import * as MP4 from "../common/mp4"

export async function decodeInit(stream: ReadableStream<Uint8Array>) {
	const mp4 = MP4.New()

	mp4.onError = (err) => {
		throw new Error(err)
	}

	let info: MP4.Info | undefined
	mp4.onReady = (v: MP4.Info) => {
		info = v
	}

	// Unfortunately we need to parse the init segment again because of the MP4Box API.
	// TODO you should optimize this before shipping.

	mp4.start()

	const reader = stream.getReader()

	let raw = new Uint8Array(0)
	let offset = 0

	for (;;) {
		const { value, done } = await reader.read()
		if (done) throw new Error("eof while parsing init")

		// For some reason we need to modify the underlying ArrayBuffer with offset
		const copy = new Uint8Array(value)
		const buffer = copy.buffer as MP4.ArrayBuffer
		buffer.fileStart = offset

		// Parse the data
		mp4.appendBuffer(buffer)
		mp4.flush()

		// Append the entire init segment into a single buffer.
		if (raw.byteLength == 0) {
			raw = copy
		} else {
			// i hate javascript
			const temp = new Uint8Array(raw.byteLength)
			temp.set(raw, 0)
			temp.set(copy, raw.length)
			raw = temp
		}

		if (info) {
			return { info, raw }
		}

		offset += buffer.byteLength
	}
}

export async function* decodeSegment(init: Uint8Array, stream: ReadableStream<Uint8Array>) {
	const mp4 = MP4.New()

	mp4.onError = (err) => {
		throw new Error(err)
	}

	mp4.onReady = (info: MP4.Info) => {
		// Extract all of the tracks, because we don't know if it's audio or video.
		for (const track of info.tracks) {
			mp4.setExtractionOptions(track.id, track, { nbSamples: 1 })
		}
	}

	// Unfortunately we need to parse the init segment again because of the MP4Box API.
	// TODO you should optimize this before shipping.

	if (init.byteOffset !== 0 || init.byteLength !== init.buffer.byteLength) {
		// Throw an error instead of making a copy
		throw new Error("TODO can't use views because mp4box is dumb")
	}

	const raw = init.buffer as MP4.ArrayBuffer
	raw.fileStart = 0

	// Parse the data
	mp4.appendBuffer(raw)
	mp4.flush()

	const frames = new Array<Frame>()
	let offset = init.byteLength

	mp4.onSamples = (_track_id: number, track: MP4.Track, samples: MP4.Sample[]) => {
		for (const sample of samples) {
			frames.push({
				track,
				sample,
				timestamp: sample.dts / track.timescale, // TODO don't convert to seconds for better accuracy
			})
		}
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

		// Yield any frames that were parsed.
		for (;;) {
			const frame = frames.shift()
			if (!frame) break

			yield frame
		}

		offset += buffer.byteLength
	}
}

/*
// Decoder receives a QUIC stream, parsing the MP4 container, and passing samples to the Timeline.
export class Decoder {
	#timeline: Timeline
	#info = new Deferred<MP4.Info>()
	#raw: MP4.ArrayBuffer[] = []

	constructor(timeline: Timeline) {
		this.#timeline = timeline
	}

	async info(): Promise<MP4.Info> {
		return this.#info.promise
	}

	async receive(header: Header, stream: ReadableStream) {
		if (header.track === 0n) {
			await this.#catalog(header, stream)
		} else {
			await this.#segment(header, stream)
		}
	}

	async #catalog(header: Header, stream: ReadableStream) {
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

	async #segment(header: Header, stream: ReadableStream) {
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
*/
