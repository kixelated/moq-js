import { Timeline } from "./timeline"

import * as Audio from "./audio"
import * as Video from "./video"

import * as MP4 from "../../media/mp4"
import * as Message from "./message"
import { asError } from "../../common/error"
import { Deferred } from "../../common/async"
import { GroupReader, Reader } from "../../transport/objects"

enum IndexedDBKeys {
	TOTAL_AMOUNT_RECV_BYTES = 1,
	FRAME_COUNTER = 2,
}

// Listen and answer to main thread (replaced by IndexedDB, maybe needed later)
/* self.addEventListener("message", async (event) => {
	const { action } = event.data
	if (action === "retrieveData") {
		try {
			const data = await retrieveValue()
			// Send the retrieved data back to the main thread
			self.postMessage({ action: "dataRetrieved", data })
		} catch (error) {
			console.error("Error retrieving data:", error)
		}
	}
}) */

let db: IDBDatabase // Declare db variable at the worker scope

// Open or create a database
// TODO: Why 2?
const openRequest = indexedDB.open("myStore", 2)

// Handle the success event when the database is successfully opened
openRequest.onsuccess = (event) => {
	db = (event.target as IDBOpenDBRequest).result // Assign db when database is opened

	initializeIndexedDB()
}

// Handle any errors that occur during database opening
openRequest.onerror = (event) => {
	console.error("Error opening database:", (event.target as IDBOpenDBRequest).error)
}

// Handle the upgrade needed event to create or upgrade the database schema (maybe needed later)
/* openRequest.onupgradeneeded = (event) => {

	db = (event.target as IDBOpenDBRequest).result // Assign db when database is opened
	// Check if the object store already exists
	if (!db.objectStoreNames.contains("myStore")) {
		// Create an object store (similar to a table in SQL databases)
		const objectStore = db.createObjectStore("myStore", { keyPath: "id" })

		// Create an index on the object store
		objectStore.createIndex("valueIndex", "value")
	}
} */

// Function to initialize the current value in IndexedDB
function initializeIndexedDB() {
	if (!db) {
		console.error("IndexedDB is not initialized.")
		return
	}

	const transaction = db.transaction(["myStore"], "readwrite")
	const objectStore = transaction.objectStore("myStore")
	const initialValue = 0
	const initByteAmount = objectStore.put({ id: IndexedDBKeys.TOTAL_AMOUNT_RECV_BYTES, initialValue })
	const initFrameCounter = objectStore.put({ id: IndexedDBKeys.FRAME_COUNTER, initialValue })

	// Handle the success event when the value is stored successfully
	initByteAmount.onsuccess = () => {
		console.log("Initial Byte Amount stored successfully:", initialValue)
	}

	// Handle any errors that occur during value storage
	initByteAmount.onerror = (event) => {
		console.error("Error storing value:", (event.target as IDBRequest).error)
	}

	// Handle the success event when the value is stored successfully
	initFrameCounter.onsuccess = () => {
		console.log("Initial Frame Count stored successfully:", initialValue)
	}

	// Handle any errors that occur during value storage
	initFrameCounter.onerror = (event) => {
		console.error("Error storing value:", (event.target as IDBRequest).error)
	}
}

// Function to increase the current byte amount with a new value in IndexedDB
function increaseTotalByteAmount(newValue: number) {
	if (!db) {
		console.error("IndexedDB is not initialized.")
		return
	}

	const transaction = db.transaction(["myStore"], "readwrite")
	const objectStore = transaction.objectStore("myStore")
	const getRequest = objectStore.get(IndexedDBKeys.TOTAL_AMOUNT_RECV_BYTES) // Get the current byte amount from the database

	// Handle the success event when the current value is retrieved successfully
	getRequest.onsuccess = (event) => {
		const currentValue = (event.target as IDBRequest).result?.value ?? 0 // Retrieve the current value (default to 0 if not found)
		const updatedValue = currentValue + newValue // Calculate the updated value

		const putRequest = objectStore.put({ id: IndexedDBKeys.TOTAL_AMOUNT_RECV_BYTES, value: updatedValue }) // Store the updated value back into the database

		// Handle the success event when the updated value is stored successfully
		putRequest.onsuccess = () => {
			console.log("Byte Amount increased successfully. New value:", updatedValue)
		}

		// Handle any errors that occur during value storage
		putRequest.onerror = (event) => {
			console.error("Error storing updated value:", (event.target as IDBRequest).error)
		}
	}

	// Handle any errors that occur during value retrieval
	getRequest.onerror = (event) => {
		console.error("Error retrieving current value:", (event.target as IDBRequest).error)
	}
}

// Function to increase the current value with a new value in IndexedDB
function increaseFrameCounter() {
	if (!db) {
		console.error("IndexedDB is not initialized.")
		return
	}

	const transaction = db.transaction(["myStore"], "readwrite")
	const objectStore = transaction.objectStore("myStore")
	const getRequest = objectStore.get(IndexedDBKeys.FRAME_COUNTER) // Get the current frame count from the database

	// Handle the success event when the current value is retrieved successfully
	getRequest.onsuccess = (event) => {
		const currentValue = (event.target as IDBRequest).result?.value ?? 0 // Retrieve the current value (default to 0 if not found)
		const updatedValue = currentValue + 1 // Calculate the updated value

		const putRequest = objectStore.put({ id: IndexedDBKeys.FRAME_COUNTER, value: updatedValue }) // Store the updated value back into the database

		// Handle the success event when the updated value is stored successfully
		putRequest.onsuccess = () => {
			console.log("Number of Frames increased successfully. New value:", updatedValue)
		}

		// Handle any errors that occur during value storage
		putRequest.onerror = (event) => {
			console.error("Error storing updated value:", (event.target as IDBRequest).error)
		}
	}

	// Handle any errors that occur during value retrieval
	getRequest.onerror = (event) => {
		console.error("Error retrieving current value:", (event.target as IDBRequest).error)
	}
}

class Worker {
	// Timeline receives samples, buffering them and choosing the timestamp to render.
	#timeline = new Timeline()

	// A map of init tracks.
	#inits = new Map<string, Deferred<Uint8Array>>()

	// Renderer requests samples, rendering video frames and emitting audio frames.
	#audio?: Audio.Renderer
	#video?: Video.Renderer

	on(e: MessageEvent) {
		const msg = e.data as Message.ToWorker

		if (msg.config) {
			this.#onConfig(msg.config)
		} else if (msg.init) {
			// TODO buffer the init segmnet so we don't hold the stream open.
			this.#onInit(msg.init)
		} else if (msg.segment) {
			this.#onSegment(msg.segment).catch(console.warn)
		} else {
			throw new Error(`unknown message: + ${JSON.stringify(msg)}`)
		}
	}

	#onConfig(msg: Message.Config) {
		if (msg.audio) {
			this.#audio = new Audio.Renderer(msg.audio, this.#timeline.audio)
		}

		if (msg.video) {
			this.#video = new Video.Renderer(msg.video, this.#timeline.video)
		}
	}

	#onInit(msg: Message.Init) {
		let init = this.#inits.get(msg.name)
		if (!init) {
			init = new Deferred()
			this.#inits.set(msg.name, init)
		}

		init.resolve(msg.data)
	}

	async #onSegment(msg: Message.Segment) {
		let init = this.#inits.get(msg.init)
		if (!init) {
			init = new Deferred()
			this.#inits.set(msg.init, init)
		}

		// Create a new stream that we will use to decode.
		const container = new MP4.Parser(await init.promise)

		const timeline = msg.kind === "audio" ? this.#timeline.audio : this.#timeline.video
		const reader = new GroupReader(msg.header, new Reader(msg.buffer, msg.stream))

		// Create a queue that will contain each MP4 frame.
		const queue = new TransformStream<MP4.Frame>({})
		const segment = queue.writable.getWriter()

		// Add the segment to the timeline
		const segments = timeline.segments.getWriter()
		await segments.write({
			sequence: msg.header.group,
			frames: queue.readable,
		})
		segments.releaseLock()

		console.log("GROUP_READER", reader)

		// Read each chunk, decoding the MP4 frames and adding them to the queue.
		for (;;) {
			const chunk = await reader.read()
			console.log("GROUP_CHUNK", chunk)

			if (!chunk) {
				break
			}

			// Increase the total amount of received bytes
			increaseTotalByteAmount(chunk.payload.byteLength)

			const frames = container.decode(chunk.payload)
			for (const frame of frames) {
				console.log("FRAME")

				increaseFrameCounter()

				await segment.write(frame)
			}
		}

		// We done.
		await segment.close()
	}
}

// Pass all events to the worker
const worker = new Worker()
self.addEventListener("message", (msg) => {
	try {
		worker.on(msg)
	} catch (e) {
		const err = asError(e)
		console.warn("worker error:", err)
	}
})

// Validates this is an expected message
function _send(msg: Message.FromWorker) {
	postMessage(msg)
}
