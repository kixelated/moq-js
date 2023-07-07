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
		console.log("add", track)
		const id = this.#mp4.addTrack(track)
		console.log(id)
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

	// The total number of samples we've produced.
	#samples = 0

	constructor(mp4: MP4.ISOFile, trak: MP4.Trak) {
		this.#mp4 = mp4
		this.#trak = trak
	}

	add(frame: EncodedVideoChunk) {
		const stream = new MP4.Stream()
		stream.endianness = false // BigEndian TODO typed

		// TODO avoid this extra copy by writing to the mdat directly
		const buffer = new Uint8Array(frame.byteLength)
		frame.copyTo(buffer)

		const moof = this.#mp4.createSingleSampleMoof({
			number: this.#samples++,
			track_id: this.#trak.tkhd.track_id,
			timescale: this.#trak.mdia.mdhd.timescale,
			description_index: 0,
			description: this.#trak.mdia.minf.stbl.stsd.entries[0],
			data: buffer,
			size: buffer.byteLength,
			duration: frame.duration ?? 0,
			cts: frame.timestamp,
			dts: frame.timestamp,
			is_sync: frame.type == "key",
			is_leading: 0,
			depends_on: 0,
			is_depended_on: 0,
			has_redundancy: 0,
			degration_priority: 0,
			offset: 0,
			subsamples: undefined,
		})

		console.log(frame.timestamp, this.#trak.mdia.mdhd.timescale)

		moof.write(stream)
		stream.writeUint32(buffer.byteLength + 8)
		stream.writeString("mdat")
		stream.writeUint8Array(buffer)

		if (this.#segment && frame.type == "key") {
			this.#segmentSequence += 1n
			this.#segment.end()
			this.#segment = undefined
		}

		if (!this.#segment) {
			this.#segment = new ContainerSegment(this.#segmentSequence)
			this.#segments.push(this.#segment)
		}

		const data = new Uint8Array(stream.buffer)
		this.#segment.push(data)
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
