import * as MP4 from "../common/mp4"
import { List, Watch } from "../common/async"

export interface Catalog {
	sequence: bigint
	init: Uint8Array
}

export class Container {
	#mp4: MP4.ISOFile

	#tracks = new Array<ContainerTrack>()

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

		const container = new ContainerTrack(this.#mp4, trak)
		this.#tracks.push(container)

		const buffer = MP4.ISOFile.writeInitializationSegment(this.#mp4.ftyp!, this.#mp4.moov!, 0, 0)
		const init = new Uint8Array(buffer)

		const [catalog] = this.#catalog.value()
		const sequence = (catalog?.sequence ?? -1n) + 1n
		this.#catalog.update({ sequence, init })

		return container
	}

	track(id: number): ContainerTrack | undefined {
		return this.#tracks.at(id - 1) // MP4 is 1 indexed
	}
}

export class ContainerTrack {
	#mp4: MP4.ISOFile
	#trak: MP4.Trak

	#segment?: ContainerSegment
	#segments = new List<ContainerSegment>()
	#segmentSequence = 0n

	constructor(mp4: MP4.ISOFile, trak: MP4.Trak) {
		this.#mp4 = mp4
		this.#trak = trak
	}

	add(frame: EncodedVideoChunk) {
		// Check if we should close the current segment
		if (this.#segment && frame.type == "key") {
			this.#segmentSequence += 1n
			this.#segment.end()
			this.#segment = undefined
		}

		// Check if we need to create a new segment
		if (!this.#segment) {
			this.#segment = new ContainerSegment(this.#segmentSequence)
			this.#segments.push(this.#segment)
		}

		// TODO avoid this extra copy by writing to the mdat directly
		// ...and changing mp4box.js to take an offset instead of ArrayBuffer
		const buffer = new Uint8Array(frame.byteLength)
		frame.copyTo(buffer)

		// Add the sample to the container
		this.#mp4.addSample(this.#trak.tkhd.track_id, buffer, {
			duration: 0,
			dts: frame.timestamp,
			cts: frame.timestamp,
			is_sync: frame.type == "key",
		})

		const stream = new MP4.Stream()
		stream.endianness = MP4.Stream.BIG_ENDIAN

		// Moof and mdat atoms are written in pairs.
		for (;;) {
			const moof = this.#mp4.moofs.shift()
			const mdat = this.#mp4.mdats.shift()

			if (!moof && !mdat) break
			if (!moof) throw new Error("moof missing")
			if (!mdat) throw new Error("mdat missing")

			moof.write(stream)
			mdat.write(stream)
		}

		this.#segment.push(new Uint8Array(stream.buffer))
	}

	segments() {
		return this.#segments.get()
	}

	end() {
		this.#segments.close()
	}
}

export class ContainerSegment {
	#fragments = new List<Uint8Array>()
	readonly sequence: bigint

	constructor(sequence: bigint) {
		this.sequence = sequence
	}

	push(data: Uint8Array) {
		this.#fragments.push(data)
	}

	fragments() {
		return this.#fragments.get()
	}

	end() {
		this.#fragments.close()
	}
}
