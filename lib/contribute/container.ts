import * as MP4 from "../media/mp4"
import { Chunk } from "./chunk"

import { IndexedDBObjectStores, IndexedDBFramesSchema } from "./video"

type DecoderConfig = AudioDecoderConfig | VideoDecoderConfig
type EncodedChunk = EncodedAudioChunk | EncodedVideoChunk

let db: IDBDatabase

export class Container {
	#mp4: MP4.ISOFile
	#frame?: EncodedAudioChunk | EncodedVideoChunk // 1 frame buffer
	#track?: number
	#segment = 0

	// For some reason there is already one frame being containerized, so we start with 1 instead of 0
	#frameID = 1

	encode: TransformStream<DecoderConfig | EncodedChunk, Chunk>

	constructor() {
		// Open IndexedDB
		const openRequest = indexedDB.open("IndexedDB", 1)

		// Handle the success event when the database is successfully opened
		openRequest.onsuccess = (event) => {
			db = (event.target as IDBOpenDBRequest).result // Assign db when database is opened
		}

		this.#mp4 = new MP4.ISOFile()
		this.#mp4.init()

		this.encode = new TransformStream({
			transform: (frame, controller) => {
				if (isDecoderConfig(frame)) {
					return this.#init(frame, controller)
				} else {
					return this.#enqueue(frame, controller)
				}
			},
		})
	}

	// Function to add the time of mp4 containerization for each frame in IndexedDB
	addFrameContainerizationTimestamp(frame: EncodedChunk, frameID: number, currentTimeInMilliseconds: number) {
		if (!db) {
			console.error("IndexedDB is not initialized.")
			return
		}

		const transaction = db.transaction(IndexedDBObjectStores.FRAMES, "readwrite")
		const objectStore = transaction.objectStore(IndexedDBObjectStores.FRAMES)
		const updateRequest = objectStore.get(frameID)

		// Handle the success event when the current value is retrieved successfully
		updateRequest.onsuccess = (event) => {
			const currentFrame: IndexedDBFramesSchema = (event.target as IDBRequest).result ?? {} // Retrieve the current value (default to 0 if not found)

			const updatedFrame = {
				...currentFrame,
				_2_containerizationTime: currentTimeInMilliseconds - currentFrame._1_rawVideoTimestamp,
				_3_createMP4FrameTimestamp: currentTimeInMilliseconds,
				_10_encodedTimestampAttribute: frame.timestamp,
				_13_sentBytes: frame.byteLength,
			} as IndexedDBFramesSchema // Calculate the updated value

			const putRequest = objectStore.put(updatedFrame, frameID) // Store the updated value back into the database

			// Handle the success event when the updated value is stored successfully
			putRequest.onsuccess = () => {
				// console.log("Frame updated successfully. New value:", updatedFrame)
			}

			// Handle any errors that occur during value storage
			putRequest.onerror = (event) => {
				console.error("Error storing updated value:", (event.target as IDBRequest).error)
			}
		}

		// Handle any errors that occur during value retrieval
		updateRequest.onerror = (event) => {
			console.error("Error updating frame:", (event.target as IDBRequest).error)
		}
	}

	#init(frame: DecoderConfig, controller: TransformStreamDefaultController<Chunk>) {
		if (this.#track) throw new Error("duplicate decoder config")

		let codec = frame.codec.substring(0, 4)
		if (codec == "opus") {
			codec = "Opus"
		}

		const options: MP4.TrackOptions = {
			type: codec,
			timescale: 1_000_000,
		}

		if (isVideoConfig(frame)) {
			options.width = frame.codedWidth
			options.height = frame.codedHeight
		} else {
			options.channel_count = frame.numberOfChannels
			options.samplerate = frame.sampleRate
		}

		if (!frame.description) throw new Error("missing frame description")
		const desc = frame.description as ArrayBufferLike

		if (codec === "avc1") {
			options.avcDecoderConfigRecord = desc
		} else if (codec === "hev1") {
			options.hevcDecoderConfigRecord = desc
		} else if (codec === "Opus") {
			// description is an identification header: https://datatracker.ietf.org/doc/html/rfc7845#section-5.1
			// The first 8 bytes are the magic string "OpusHead", followed by what we actually want.
			const dops = new MP4.BoxParser.dOpsBox(undefined)

			// Annoyingly, the header is little endian while MP4 is big endian, so we have to parse.
			const data = new MP4.Stream(desc, 8, MP4.Stream.LITTLE_ENDIAN)
			dops.parse(data)

			dops.Version = 0
			options.description = dops
			options.hdlr = "soun"
		} else {
			throw new Error(`unsupported codec: ${codec}`)
		}

		this.#track = this.#mp4.addTrack(options)
		if (!this.#track) throw new Error("failed to initialize MP4 track")

		const buffer = MP4.ISOFile.writeInitializationSegment(this.#mp4.ftyp!, this.#mp4.moov!, 0, 0)
		const data = new Uint8Array(buffer)

		controller.enqueue({
			type: "init",
			timestamp: 0,
			duration: 0,
			data,
		})
	}

	#enqueue(frame: EncodedChunk, controller: TransformStreamDefaultController<Chunk>) {
		// Check if we should create a new segment
		if (frame.type == "key") {
			this.#segment += 1
		} else if (this.#segment == 0) {
			throw new Error("must start with keyframe")
		}

		// We need a one frame buffer to compute the duration
		if (!this.#frame) {
			this.#frame = frame
			return
		}

		const duration = frame.timestamp - this.#frame.timestamp

		// TODO avoid this extra copy by writing to the mdat directly
		// ...which means changing mp4box.js to take an offset instead of ArrayBuffer
		const buffer = new Uint8Array(this.#frame.byteLength)
		this.#frame.copyTo(buffer)

		if (!this.#track) throw new Error("missing decoder config")

		// Add the sample to the container
		this.#mp4.addSample(this.#track, buffer, {
			duration: this.#frameID - 1, // TODO: Don't manipulate the duration field in order to add a frame ID
			dts: this.#frame.timestamp,
			cts: this.#frame.timestamp, // Static values here lead to these values on the receiving side: 4293440496 4274800177 4293040498 4293176284
			is_sync: this.#frame.type == "key",
		})

		const stream = new MP4.Stream(undefined, 0, MP4.Stream.BIG_ENDIAN)

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

		// TODO avoid this extra copy by writing to the buffer provided in copyTo
		const data = new Uint8Array(stream.buffer)

		controller.enqueue({
			type: this.#frame.type,
			timestamp: this.#frame.timestamp,
			duration: this.#frame.duration ?? 0,
			data,
		})

		// Check whether the frame is a video frame
		if (frame.duration === 0) {
			this.addFrameContainerizationTimestamp(frame, this.#frameID, Date.now())
		}

		this.#frameID++

		this.#frame = frame
	}

	/* TODO flush the last frame
	#flush(controller: TransformStreamDefaultController<Chunk>) {
		if (this.#frame) {
			// TODO guess the duration
			this.#enqueue(this.#frame, 0, controller)
		}
	}
	*/
}

function isDecoderConfig(frame: DecoderConfig | EncodedChunk): frame is DecoderConfig {
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	return (frame as DecoderConfig).codec !== undefined
}

function isVideoConfig(frame: DecoderConfig): frame is VideoDecoderConfig {
	return (frame as VideoDecoderConfig).codedWidth !== undefined
}
