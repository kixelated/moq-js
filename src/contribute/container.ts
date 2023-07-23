import * as MP4 from "../common/mp4"
import { Watch } from "../common/async"

export interface Catalog {
	sequence: bigint
	init: Uint8Array
}

export class Container {
	#mp4: MP4.ISOFile
	#catalog = new Watch<Catalog | undefined>(undefined)

	constructor() {
		this.#mp4 = new MP4.ISOFile()
		this.#mp4.init()
	}

	async catalog() {
		for (;;) {
			const [catalog, next] = this.#catalog.value()
			if (catalog) return catalog
			if (!next) return

			await next
		}
	}

	add(track: MP4.TrackOptions): ContainerTrack {
		const id = this.#mp4.addTrack(track)
		const trak = this.#mp4.getTrackById(id)
		if (!trak) throw new Error("failed to get newly created track")

		const container = new ContainerTrack(this.#mp4, id)

		const buffer = MP4.ISOFile.writeInitializationSegment(this.#mp4.ftyp!, this.#mp4.moov!, 0, 0)
		const init = new Uint8Array(buffer)

		const [catalog] = this.#catalog.value()
		const sequence = (catalog?.sequence ?? -1n) + 1n
		this.#catalog.update({ sequence, init })

		return container
	}
}

export interface Fragment {
	segment: number // incremented on each keyframe
	data: Uint8Array
}

export class ContainerTrack {
	readonly id: number

	#mp4: MP4.ISOFile
	//#trak: MP4.Trak
	//#samples = 0

	#segment = 0

	frames: TransformStream<EncodedVideoChunk, Fragment>
	#frame?: EncodedVideoChunk // 1 frame buffer

	constructor(mp4: MP4.ISOFile, id: number) {
		this.#mp4 = mp4
		this.id = id

		this.frames = new TransformStream({
			transform: this.#transform.bind(this),
			flush: this.#close.bind(this),
		})
	}

	#transform(frame: EncodedVideoChunk, controller: TransformStreamDefaultController<Fragment>) {
		// Check if we should create a new segment
		if (this.#segment > 0 && frame.type == "key") {
			this.#segment += 1
		}

		// We need a one frame buffer to compute the duration
		if (this.#frame) {
			this.#flush(this.#frame, frame.timestamp - this.#frame.timestamp, controller)
		}

		this.#frame = frame
	}

	#flush(frame: EncodedVideoChunk, duration: number, controller: TransformStreamDefaultController<Fragment>) {
		// TODO avoid this extra copy by writing to the mdat directly
		// ...which means changing mp4box.js to take an offset instead of ArrayBuffer
		const buffer = new Uint8Array(frame.byteLength)
		frame.copyTo(buffer)

		// Add the sample to the container
		this.#mp4.addSample(this.id, buffer, {
			duration,
			dts: frame.timestamp,
			cts: frame.timestamp,
			is_sync: frame.type == "key",
		})

		const stream = new MP4.Stream()
		stream.endianness = MP4.Stream.BIG_ENDIAN

		// Moof and mdat atoms are written in pairs.
		// TODO remove the moof/mdat from the Box to reclaim memory once everything works
		for (;;) {
			const moof = this.#mp4.moofs.shift()
			const mdat = this.#mp4.mdats.shift()

			if (!moof && !mdat) break
			if (!moof) throw new Error("moof missing")
			if (!mdat) throw new Error("mdat missing")

			moof.write(stream)
			mdat.write(stream)
		}

		const data = new Uint8Array(stream.buffer)
		controller.enqueue({ segment: this.#segment, data })
	}

	#close(controller: TransformStreamDefaultController<Fragment>) {
		if (this.#frame) {
			// TODO guess the duration
			this.#flush(this.#frame, 0, controller)
		}
	}
}
