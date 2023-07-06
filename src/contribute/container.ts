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

	async *catalog() {
		const current = this.#catalog.current()
		if (current) {
			yield current
		}

		for (;;) {
			const current = await this.#catalog.next()
			if (!current) break

			yield current
		}
	}

	add(track: MP4.TrackOptions): ContainerTrack {
		const id = this.#mp4.addTrack(track)
		const container = new ContainerTrack(this.#mp4, id)

		const stream = new MP4.Stream()
		this.#mp4.ftyp!.write(stream)
		this.#mp4.moov!.write(stream)
		const init = new Uint8Array(stream.buffer)

		const catalog = this.#catalog.current()
		const sequence = (catalog?.sequence ?? -1n) + 1n
		this.#catalog.update({ sequence, init })

		return container
	}

	track(id: number): ContainerTrack | undefined {
		return this.#tracks.at(id)
	}

	/*
	addSample(track: number, frame: EncodedVideoChunk): Uint8Array {
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
	*/
}

export class ContainerTrack {
	#mp4: MP4.ISOFile
	#id: number

	#current?: ContainerSegment
	#segments = new List<ContainerSegment>()
	#sequence = 0n

	constructor(mp4: MP4.ISOFile, id: number) {
		this.#mp4 = mp4
		this.#id = id
	}

	add(frame: EncodedVideoChunk) {
		const stream = new MP4.Stream()

		// TODO avoid this extra copy by writing to the mdat directly
		const buffer = new Uint8Array(frame.byteLength)
		frame.copyTo(buffer)

		const sample = this.#mp4.addSample(this.#id, buffer, {
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

		if (this.#current && frame.type == "key") {
			this.#sequence += 1n
			this.#current.end()
		}

		if (!this.#current) {
			this.#current = new ContainerSegment(this.#sequence)
			this.#segments.push(this.#current)
		}

		const data = new Uint8Array(stream.buffer)
		this.#current.push(data)
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

	constructor(public sequence: bigint) {}

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
