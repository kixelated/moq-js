import { Frame, Component } from "./timeline"
import * as MP4 from "../../media/mp4"
import * as Message from "./message"

import { IndexedDBObjectStores, IndexedDBFramesSchema, IndexedDatabaseName } from "../../contribute"

let db: IDBDatabase // Declare db variable at the worker scope

// Open or create a database
const openRequest = indexedDB.open(IndexedDatabaseName, 1)

// Handle the success event when the database is successfully opened
openRequest.onsuccess = (event) => {
	db = (event.target as IDBOpenDBRequest).result // Assign db when database is opened
}

// Handle any errors that occur during database opening
openRequest.onerror = (event) => {
	console.error("Error opening database:", (event.target as IDBOpenDBRequest).error)
}

// Function to add the decode timestamp of a frame in IndexedDB
function addReceiveMP4FrameTimestamp(frame: Frame, currentTimeInMilliseconds: number) {
	if (!db) {
		console.error("IndexedDB is not initialized.")
		return
	}

	const transaction = db.transaction(IndexedDBObjectStores.FRAMES, "readwrite")
	const objectStore = transaction.objectStore(IndexedDBObjectStores.FRAMES)
	const updateRequest = objectStore.get(frame.sample.duration)

	// Handle the success event when the current value is retrieved successfully
	updateRequest.onsuccess = (event) => {
		const currentFrame: IndexedDBFramesSchema = (event.target as IDBRequest).result ?? {} // Retrieve the current value (default to 0 if not found)
		// console.log("CURRENT_FRAME", frame.sample.duration, currentFrame)

		const updatedFrame = {
			...currentFrame,
			_4_propagationTime: currentTimeInMilliseconds - currentFrame._3_createMP4FrameTimestamp,
			_5_receiveMp4FrameTimestamp: currentTimeInMilliseconds,
			_11_decodedTimestampAttribute: frame.sample.dts,
			_14_receivedBytes: frame.sample.size,
		} as IndexedDBFramesSchema // Calculate the updated value

		const putRequest = objectStore.put(updatedFrame, frame.sample.duration) // Store the updated value back into the database

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

// Function to add the render timestamp of a frame in IndexedDB
function addRenderFrameTimestamp(frame: VideoFrame, currentTimeInMilliseconds: number) {
	if (!db) {
		console.error("IndexedDB is not initialized.")
		return
	}

	const transaction = db.transaction(IndexedDBObjectStores.FRAMES, "readwrite")
	const objectStore = transaction.objectStore(IndexedDBObjectStores.FRAMES)
	const updateRequest = objectStore.get(frame.duration!)

	// Handle the success event when the current value is retrieved successfully
	updateRequest.onsuccess = (event) => {
		const currentFrame: IndexedDBFramesSchema = (event.target as IDBRequest).result ?? {} // Retrieve the current value (default to 0 if not found)
		// console.log("CURRENT_FRAME", frame.sample.duration, currentFrame)

		const updatedFrame = {
			...currentFrame,
			_6_renderFrameTime: currentTimeInMilliseconds - currentFrame._5_receiveMp4FrameTimestamp,
			_7_renderFrameTimestamp: currentTimeInMilliseconds,
			_8_totalTime: currentTimeInMilliseconds - currentFrame._1_rawVideoTimestamp,
			_12_renderTimestampAttribute: frame.timestamp,
		} as IndexedDBFramesSchema

		const putRequest = objectStore.put(updatedFrame, frame.duration!) // Store the updated value back into the database

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

export class Renderer {
	#canvas: OffscreenCanvas
	#timeline: Component

	#decoder!: VideoDecoder
	#queue: TransformStream<Frame, VideoFrame>

	constructor(config: Message.ConfigVideo, timeline: Component) {
		this.#canvas = config.canvas
		this.#timeline = timeline

		this.#queue = new TransformStream({
			start: this.#start.bind(this),
			transform: this.#transform.bind(this),
		})

		this.#run().catch(console.error)
	}

	async #run() {
		const reader = this.#timeline.frames.pipeThrough(this.#queue).getReader()
		for (;;) {
			const { value: frame, done } = await reader.read()
			if (done) break

			self.requestAnimationFrame(() => {
				this.#canvas.width = frame.displayWidth
				this.#canvas.height = frame.displayHeight

				const ctx = this.#canvas.getContext("2d")
				if (!ctx) throw new Error("failed to get canvas context")

				addRenderFrameTimestamp(frame, Date.now())

				ctx.drawImage(frame, 0, 0, frame.displayWidth, frame.displayHeight) // TODO respect aspect ratio
				frame.close()
			})
		}
	}

	#start(controller: TransformStreamDefaultController<VideoFrame>) {
		this.#decoder = new VideoDecoder({
			output: (frame: VideoFrame) => {
				controller.enqueue(frame)
			},
			error: console.error,
		})
	}

	#transform(frame: Frame) {
		// Configure the decoder with the first frame
		if (this.#decoder.state !== "configured") {
			const { sample, track } = frame

			const desc = sample.description
			const box = desc.avcC ?? desc.hvcC ?? desc.vpcC ?? desc.av1C
			if (!box) throw new Error(`unsupported codec: ${track.codec}`)

			const buffer = new MP4.Stream(undefined, 0, MP4.Stream.BIG_ENDIAN)
			box.write(buffer)
			const description = new Uint8Array(buffer.buffer, 8) // Remove the box header.

			if (!MP4.isVideoTrack(track)) throw new Error("expected video track")

			this.#decoder.configure({
				codec: track.codec,
				codedHeight: track.video.height,
				codedWidth: track.video.width,
				description,
				// optimizeForLatency: true
			})
		}

		const chunk = new EncodedVideoChunk({
			type: frame.sample.is_sync ? "key" : "delta",
			data: frame.sample.data,
			timestamp: frame.sample.dts,
			duration: frame.sample.duration,
		})

		addReceiveMP4FrameTimestamp(frame, Date.now())

		this.#decoder.decode(chunk)
	}
}
