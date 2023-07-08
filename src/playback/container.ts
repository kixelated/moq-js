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
