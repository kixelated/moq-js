import { MP4 } from "~/shared"
import { Encoder, EncoderTrack } from "./encoder"
import { segmented } from "./segment"

export class Container {
	#encoder: Encoder
	#mp4: MP4.ISOFile

	init: Promise<Uint8Array>
	tracks: Array<ContainerTrack> = []

	constructor(encoder: Encoder) {
		this.#encoder = encoder
		for (const [id, track] of this.#encoder.tracks.entries()) {
			this.tracks.push(new ContainerTrack(this, id, track))
		}

		this.#mp4 = new MP4.ISOFile()
		this.#mp4.init()

		this.init = this.#init()
	}

	async #init(): Promise<Uint8Array> {
		for (const track of this.tracks) {
			const info = await track.init()
			this.#mp4.addTrack(info)
		}

		const stream = new MP4.Stream()
		this.#mp4.ftyp!.write(stream)
		this.#mp4.moov!.write(stream)

		return new Uint8Array(stream.buffer)
	}

	encode(track: number, frame: EncodedVideoChunk): Uint8Array {
		const stream = new MP4.Stream()

		// TODO avoid this extra copy
		const buffer = new Uint8Array(frame.byteLength)
		frame.copyTo(buffer)

		const sample = this.#mp4.addSample(track, buffer, {
			is_sync: frame.type == "key",
			duration: frame.duration!,
			dts: frame.timestamp,
		})

		const moof = this.#mp4.createSingleSampleMoof(sample)
		moof.write(stream)

		// TODO can we remove/avoid these offsets?
		// moof.trafs[0].truns[0].data_offset = moof.size+8; //8 is mdat header
		// stream.adjustUint32(moof.trafs[0].truns[0].data_offset_position, moof.trafs[0].truns[0].data_offset);

		stream.writeUint32(buffer.byteLength + 8)
		stream.writeString("mdat")
		stream.writeUint8Array(buffer)

		return buffer
	}
}

export class ContainerTrack {
	#encoder: EncoderTrack

	container: Container
	id: number
	segments: ReadableStream<ContainerSegment>

	constructor(container: Container, id: number, encoder: EncoderTrack) {
		this.container = container
		this.id = id

		this.#encoder = encoder

		// Convert a stream of frames into a stream of segments.
		const segments = this.#encoder.frames.pipeThrough(segmented())
		let sequence = 0

		// Wrap each segment in a container segment.
		this.segments = segments.pipeThrough(
			new TransformStream({
				transform: (segment, controller) => {
					const next = new ContainerSegment(this, sequence, segment)
					controller.enqueue(next)
					sequence += 1
				},
			})
		)
	}

	get name(): string {
		return this.id.toString()
	}

	async init(): Promise<MP4.TrackOptions> {
		const init = await this.#encoder.init()

		return {
			id: this.id,
			type: "avc1", // TODO configurable
			width: init.codedWidth,
			height: init.codedHeight,
			timescale: 1000, // TODO verify
			description: init.description,
		}
	}

	encode(frame: EncodedVideoChunk): Uint8Array {
		return this.container.encode(this.id, frame)
	}
}

export class ContainerSegment {
	track: ContainerTrack
	fragments: ReadableStream<Uint8Array>
	sequence: number

	constructor(track: ContainerTrack, sequence: number, frames: ReadableStream<EncodedVideoChunk>) {
		this.track = track
		this.sequence = sequence

		this.fragments = frames.pipeThrough(
			new TransformStream({
				transform: (frame, controller) => {
					controller.enqueue(this.track.encode(frame))
				},
			})
		)
	}

	cancel() {
		this.fragments.cancel()
	}
}
