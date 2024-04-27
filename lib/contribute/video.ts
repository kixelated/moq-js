const SUPPORTED = [
	"avc1", // H.264
	"hev1", // HEVC (aka h.265)
	// "av01", // TDOO support AV1
]

export const IndexedDatabaseName = "IndexedDB"

export enum IndexedDBObjectStores {
	START_STREAM_TIME = "StartStreamTime",
	FRAMES = "Frames",
}

export interface IndexedDBFramesSchema {
	_1_rawVideoTimestamp: number
	_2_containerizationTime: number
	_3_createMP4FrameTimestamp: number
	_4_propagationTime: number
	_5_receiveMp4FrameTimestamp: number
	_6_renderFrameTime: number
	_7_renderFrameTimestamp: number
	_8_totalTime: number
	_9_originalTimestampAttribute: number
	_10_encodedTimestampAttribute: number
	_11_decodedTimestampAttribute: number
	_12_renderTimestampAttribute: number
	_13_sentBytes: number
	_14_receivedBytes: number
}

let db: IDBDatabase

export interface EncoderSupported {
	codecs: string[]
}

export class Encoder {
	#encoder!: VideoEncoder
	#encoderConfig: VideoEncoderConfig
	#decoderConfig?: VideoDecoderConfig

	// true if we should insert a keyframe, undefined when the encoder should decide
	#keyframeNext: true | undefined = true

	// Count the number of frames without a keyframe.
	#keyframeCounter = 0

	// Converts raw rames to encoded frames.
	frames: TransformStream<VideoFrame, VideoDecoderConfig | EncodedVideoChunk>

	#frameID = 0

	constructor(config: VideoEncoderConfig) {
		// Open IndexedDB
		const openRequest = indexedDB.open(IndexedDatabaseName, 1)

		// Handle the success event when the database is successfully opened
		openRequest.onsuccess = (event) => {
			db = (event.target as IDBOpenDBRequest).result // Assign db when database is opened
		}

		config.bitrateMode ??= "constant"
		config.latencyMode ??= "realtime"

		this.#encoderConfig = config

		this.frames = new TransformStream({
			start: this.#start.bind(this),
			transform: this.#transform.bind(this),
			flush: this.#flush.bind(this),
		})
	}

	// Function to add the time of creation for each frame in IndexedDB
	addRawVideoFrameTimestamp(frame: VideoFrame, frameID: number, currentTimeInMilliseconds: number) {
		if (!db) {
			console.error("IndexedDB is not initialized.")
			return
		}

		const transaction = db.transaction(IndexedDBObjectStores.FRAMES, "readwrite")
		const objectStore = transaction.objectStore(IndexedDBObjectStores.FRAMES)
		const newFrame = {
			_1_rawVideoTimestamp: currentTimeInMilliseconds,
			_9_originalTimestampAttribute: frame.timestamp,
		} as IndexedDBFramesSchema
		const addRequest = objectStore.add(newFrame, frameID)

		// Handle the success event when the updated value is stored successfully
		addRequest.onsuccess = () => {
			// console.log("Frame added successfully. New frame:", newFrame, frameID)
		}

		// Handle any errors that occur during value retrieval
		addRequest.onerror = (event) => {
			console.error("Error adding current frame:", (event.target as IDBRequest).error)
		}
	}

	static async isSupported(config: VideoEncoderConfig) {
		// Check if we support a specific codec family
		const short = config.codec.substring(0, 4)
		if (!SUPPORTED.includes(short)) return false

		// Default to hardware encoding
		config.hardwareAcceleration ??= "prefer-hardware"

		// Default to CBR
		config.bitrateMode ??= "constant"

		// Default to realtime encoding
		config.latencyMode ??= "realtime"

		const res = await VideoEncoder.isConfigSupported(config)
		return !!res.supported
	}

	#start(controller: TransformStreamDefaultController<EncodedVideoChunk>) {
		this.#encoder = new VideoEncoder({
			output: (frame, metadata) => {
				this.#enqueue(controller, frame, metadata)
			},
			error: (err) => {
				throw err
			},
		})

		this.#encoder.configure(this.#encoderConfig)
	}

	#transform(frame: VideoFrame) {
		const encoder = this.#encoder

		this.addRawVideoFrameTimestamp(frame, this.#frameID, Date.now())

		// Set keyFrame to undefined when we're not sure so the encoder can decide.
		encoder.encode(frame, { keyFrame: this.#keyframeNext })
		this.#keyframeNext = undefined

		this.#frameID++

		frame.close()
	}

	#enqueue(
		controller: TransformStreamDefaultController<VideoDecoderConfig | EncodedVideoChunk>,
		frame: EncodedVideoChunk,
		metadata?: EncodedVideoChunkMetadata,
	) {
		if (!this.#decoderConfig) {
			const config = metadata?.decoderConfig
			if (!config) throw new Error("missing decoder config")

			controller.enqueue(config)
			this.#decoderConfig = config
		}

		if (frame.type === "key") {
			this.#keyframeCounter = 0
		} else {
			this.#keyframeCounter += 1
			if (this.#keyframeCounter + this.#encoder.encodeQueueSize >= 2 * this.#encoderConfig.framerate!) {
				this.#keyframeNext = true
			}
		}

		controller.enqueue(frame)
	}

	#flush() {
		this.#encoder.close()
	}

	get config() {
		return this.#encoderConfig
	}
}
