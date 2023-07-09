// https://github.com/gpac/mp4box.js/issues/233

declare module "mp4box" {
	export interface MP4MediaTrack {
		id: number
		created: Date
		modified: Date
		movie_duration: number
		layer: number
		alternate_group: number
		volume: number
		track_width: number
		track_height: number
		timescale: number
		duration: number
		bitrate: number
		codec: string
		language: string
		nb_samples: number
	}

	export interface MP4VideoData {
		width: number
		height: number
	}

	export interface MP4VideoTrack extends MP4MediaTrack {
		video: MP4VideoData
	}

	export interface MP4AudioData {
		sample_rate: number
		channel_count: number
		sample_size: number
	}

	export interface MP4AudioTrack extends MP4MediaTrack {
		audio: MP4AudioData
	}

	export type MP4Track = MP4VideoTrack | MP4AudioTrack

	export interface MP4Info {
		duration: number
		timescale: number
		fragment_duration: number
		isFragmented: boolean
		isProgressive: boolean
		hasIOD: boolean
		brands: string[]
		created: Date
		modified: Date
		tracks: MP4Track[]
		mime: string
		audioTracks: MP4AudioTrack[]
		videoTracks: MP4VideoTrack[]
	}

	export type MP4ArrayBuffer = ArrayBuffer & { fileStart: number }

	export interface MP4File {
		onMoovStart?: () => void
		onReady?: (info: MP4Info) => void
		onError?: (e: string) => void
		onSamples?: (id: number, user: any, samples: Sample[]) => void

		appendBuffer(data: MP4ArrayBuffer): number
		start(): void
		stop(): void
		flush(): void

		setExtractionOptions(id: number, user: any, options: ExtractionOptions): void
	}

	export function createFile(): MP4File

	export interface Sample {
		number: number
		track_id: number
		timescale: number
		description_index: number
		description: {
			avcC?: Box // h.264
			hvcC?: Box // hevc
			vpcC?: Box // vp9
			av1C?: Box // av1
		}
		data: ArrayBuffer
		size: number
		alreadyRead?: number
		duration: number
		cts: number
		dts: number
		is_sync: boolean
		is_leading?: number
		depends_on?: number
		is_depended_on?: number
		has_redundancy?: number
		degradation_priority?: number
		offset?: number
		subsamples?: any
	}

	export interface ExtractionOptions {
		nbSamples: number
	}

	type BIG_ENDIAN = true
	type LITTLE_ENDIAN = false
	type Endianness = LITTLE_ENDIAN | BIG_ENDIAN

	export class DataStream {
		// WARNING, the default is little endian, which is not what MP4 uses.
		constructor(buffer?: ArrayBuffer, byteOffset?: number, endianness?: Endianness)
		getPosition(): number

		get byteLength(): number
		get buffer(): ArrayBuffer
		set buffer(v: ArrayBuffer)
		get byteOffset(): number
		set byteOffset(v: number)
		get dataView(): DataView
		set dataView(v: DataView)

		seek(pos: number): void
		isEof(): boolean

		mapUint8Array(length: number): Uint8Array
		readInt32Array(length: number, endianness?: Endianness): Int32Array
		readInt16Array(length: number, endianness?: Endianness): Int16Array
		readInt8Array(length: number): Int8Array
		readUint32Array(length: number, endianness?: Endianness): Uint32Array
		readUint16Array(length: number, endianness?: Endianness): Uint16Array
		readUint8Array(length: number): Uint8Array
		readFloat64Array(length: number, endianness?: Endianness): Float64Array
		readFloat32Array(length: number, endianness?: Endianness): Float32Array

		readInt32(endianness?: Endianness): number
		readInt16(endianness?: Endianness): number
		readInt8(): number
		readUint32(endianness?: Endianness): number
		readUint16(endianness?: Endianness): number
		readUint8(): number
		readFloat32(endianness?: Endianness): number
		readFloat64(endianness?: Endianness): number

		endianness: Endianness

		memcpy(
			dst: ArrayBufferLike,
			dstOffset: number,
			src: ArrayBufferLike,
			srcOffset: number,
			byteLength: number
		): void

		// TODO I got bored porting all functions

		save(filename: string): void
		shift(offset: number): void

		writeInt32Array(arr: Int32Array, endianness?: Endianness): void
		writeInt16Array(arr: Int16Array, endianness?: Endianness): void
		writeInt8Array(arr: Int8Array): void
		writeUint32Array(arr: Uint32Array, endianness?: Endianness): void
		writeUint16Array(arr: Uint16Array, endianness?: Endianness): void
		writeUint8Array(arr: Uint8Array): void
		writeFloat64Array(arr: Float64Array, endianness?: Endianness): void
		writeFloat32Array(arr: Float32Array, endianness?: Endianness): void
		writeInt32(v: number, endianness?: Endianness): void
		writeInt16(v: number, endianness?: Endianness): void
		writeInt8(v: number): void
		writeUint32(v: number, endianness?: Endianness): void
		writeUint16(v: number, endianness?: Endianness): void
		writeUint8(v: number): void
		writeFloat32(v: number, endianness?: Endianness): void
		writeFloat64(v: number, endianness?: Endianness): void
		writeUCS2String(s: string, endianness?: Endianness, length?: number): void
		writeString(s: string, encoding?: string, length?: number): void
		writeCString(s: string, length?: number): void
		writeUint64(v: number): void
		writeUint24(v: number): void
		adjustUint32(pos: number, v: number): void

		static LITTLE_ENDIAN: LITTLE_ENDIAN
		static BIG_ENDIAN: BIG_ENDIAN
	}

	export interface TrackOptions {
		id?: number
		type?: string
		width?: number
		height?: number
		duration?: number
		layer?: number
		timescale?: number
		media_duration?: number
		language?: string
		hdlr?: string

		// video
		avcDecoderConfigRecord?: any
		hevcDecoderConfigRecord?: any

		// audio
		balance?: number
		channel_count?: number
		samplesize?: number
		samplerate?: number

		//captions
		namespace?: string
		schema_location?: string
		auxiliary_mime_types?: string

		description?: any
		description_boxes?: Box[]

		default_sample_description_index_id?: number
		default_sample_duration?: number
		default_sample_size?: number
		default_sample_flags?: number
	}

	export interface FileOptions {
		brands?: string[]
		timescale?: number
		rate?: number
		duration?: number
		width?: number
	}

	export interface SampleOptions {
		sample_description_index?: number
		duration?: number
		cts?: number
		dts?: number
		is_sync?: boolean
		is_leading?: number
		depends_on?: number
		is_depended_on?: number
		has_redundancy?: number
		degradation_priority?: number
		subsamples?: any
	}

	// TODO add the remaining functions
	// TODO move to another module
	export class ISOFile {
		constructor(stream?: DataStream)

		init(options?: FileOptions): ISOFile
		addTrack(options?: TrackOptions): number
		addSample(track: number, data: ArrayBuffer, options?: SampleOptions): Sample

		createSingleSampleMoof(sample: Sample): Box

		// helpers
		getTrackById(id: number): Trak | undefined
		getTrexById(id: number): Box | undefined

		// boxes that are added to the root
		boxes: Box[]
		mdats: Box[]
		moofs: Box[]

		ftyp?: Box
		moov?: Box

		static writeInitializationSegment(
			ftyp: Box,
			moov: Box,
			total_duration: number,
			sample_duration: number
		): ArrayBuffer
	}

	export class Box {
		size: number

		write(stream: DataStream): void
		computeSize(): void
	}

	// Non-exhaustive and I'm too lazy to split into separate interfaces
	export interface Trak extends Box {
		samples: Sample[]
		samples_duration: number
		samples_size: number

		tkhd: {
			track_id: number
			alternate_group: number
			creation_time: number
			duration: number
			flags: number
			height: number
			matrix: number[]
			volume: number
			width: number
		}

		mdia: {
			mdhd: {
				creation_time: number
				duration: number
				timescale: number
				flags: number
				language: string
				modification_time: number
			}

			minf: {
				stbl: {
					stsd: {
						entries: any[]
					}
				}
			}
		}
	}

	export {}
}
