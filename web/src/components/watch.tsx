/* eslint-disable jsx-a11y/media-has-caption */
import { Player } from "@kixelated/moq/playback"

import { IndexedDBObjectStores } from "@kixelated/moq/playback/webcodecs/worker"

import Plot from "./chart"

import Fail from "./fail"

import { createEffect, createMemo, createSelector, createSignal, onCleanup } from "solid-js"

interface IndexedDBByteAmountSchema {
	id: number
	value: number
}

export interface IndexedDBFramesSchema {
	number: number
	size: number
	timestamp: number
}

// Data update rate in milliseconds
const DATA_UPDATE_RATE = 2000

// Helper function to nicely display large numbers
function formatNumber(number: number): string {
	const suffixes = ["", "k", "M", "B", "T"] // Add more suffixes as needed
	const suffixIndex = Math.floor(Math.log10(number) / 3)
	const scaledNumber = number / Math.pow(10, suffixIndex * 3)
	const suffix = suffixes[suffixIndex]
	return scaledNumber.toFixed(2) + suffix
}

let db: IDBDatabase // Declare db variable at the worker scope

// Open or create a database
const openRequest = indexedDB.open("IndexedDB", 1)

// Handle the success event when the database is successfully opened
openRequest.onsuccess = (event) => {
	db = (event.target as IDBOpenDBRequest).result // Assign db when database is opened
}

// Function to retrieve all stored values from IndexedDB
function retrieveByteAmountFromIndexedDB(): Promise<IndexedDBByteAmountSchema> {
	return new Promise((resolve, reject) => {
		if (!db) {
			reject(new Error("IndexedDB is not initialized."))
			return
		}

		const transaction = db.transaction(IndexedDBObjectStores.TOTAL_AMOUNT_RECV_BYTES, "readonly")
		const objectStore = transaction.objectStore(IndexedDBObjectStores.TOTAL_AMOUNT_RECV_BYTES)
		const getRequest = objectStore.get(1) // Get all stored values from the database

		// Handle the success event when the values are retrieved successfully
		getRequest.onsuccess = (event) => {
			const storedValues = (event.target as IDBRequest).result as IndexedDBByteAmountSchema
			resolve(storedValues)
		}

		// Handle any errors that occur during value retrieval
		getRequest.onerror = (event) => {
			console.error("Error retrieving value:", (event.target as IDBRequest).error)
			reject((event.target as IDBRequest).error)
		}
	})
}

// Function to retrieve all stored values from IndexedDB
function retrieveFramesFromIndexedDB(): Promise<IndexedDBFramesSchema[]> {
	return new Promise((resolve, reject) => {
		if (!db) {
			reject(new Error("IndexedDB is not initialized."))
			return
		}

		const transaction = db.transaction(IndexedDBObjectStores.FRAMES, "readonly")
		const objectStore = transaction.objectStore(IndexedDBObjectStores.FRAMES)
		const getRequest = objectStore.getAll() // Get all stored values from the database

		// Handle the success event when the values are retrieved successfully
		getRequest.onsuccess = (event) => {
			const storedValues = (event.target as IDBRequest).result as IndexedDBFramesSchema[]
			resolve(storedValues)
		}

		// Handle any errors that occur during value retrieval
		getRequest.onerror = (event) => {
			console.error("Error retrieving value:", (event.target as IDBRequest).error)
			reject((event.target as IDBRequest).error)
		}
	})
}

export default function Watch(props: { name: string }) {
	// Use query params to allow overriding environment variables.
	const urlSearchParams = new URLSearchParams(window.location.search)
	const params = Object.fromEntries(urlSearchParams.entries())
	const server = params.server ?? import.meta.env.PUBLIC_RELAY_HOST

	const defaultMode = "VideoDecoder" in window ? "webcodecs" : "mse"
	const [mode, setMode] = createSignal(defaultMode)
	const [error, setError] = createSignal<Error | undefined>()
	const isMode = createSelector(mode)

	// Various dynamic meta data to be displayed next to the video
	const [currentTime, setCurrentTime] = createSignal<Date>(new Date())
	const [totalAmountRecvBytes, setTotalAmountRecvBytes] = createSignal<number>(0)
	const [frames, setFrames] = createSignal<IndexedDBFramesSchema[]>([])
	const [videoStartTime, setVideoStartTime] = createSignal<number>(0)
	const [timeString, setTimeString] = createSignal<string>("00:00:00:000")
	const [bitRate, setBitRate] = createSignal<number>(0.0)
	const [framesPerSecond, setFramesPerSecond] = createSignal<number>(0.0)

	// Define a function to update the data every second
	const updateDataInterval = setInterval(() => {
		setCurrentTime(new Date())

		// Better than below?
		const totalMilliseconds = currentTime().getTime() - videoStartTime()

		const hours = Math.floor(totalMilliseconds / 3600000) // 1 hour = 3600000 milliseconds
		const minutes = Math.floor((totalMilliseconds % 3600000) / 60000) // 1 minute = 60000 milliseconds
		const seconds = Math.floor((totalMilliseconds % 60000) / 1000) // 1 second = 1000 milliseconds
		const milliseconds = Math.floor(totalMilliseconds % 1000) // Remaining milliseconds

		// Function to retrieve data from the IndexedDB
		const retrieveData = async () => {
			const byteAmount = await retrieveByteAmountFromIndexedDB()
			const frames = await retrieveFramesFromIndexedDB()

			// Set the video start time initially
			if (videoStartTime() === 0 && frames.length > 0) {
				console.log("SET_VIDEO_START_TIME", frames[0].timestamp)

				setVideoStartTime(frames[0].timestamp)
			}

			setTotalAmountRecvBytes(byteAmount.value)
			setFrames(frames)
		}
		retrieveData().then(setError).catch(setError)

		setBitRate(parseFloat(((totalAmountRecvBytes() * 8) / seconds).toFixed(2)))
		setFramesPerSecond(parseFloat((frames().length / seconds).toFixed(2)))

		// Format the time
		const formattedTime = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(
			seconds,
		).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`
		setTimeString(formattedTime)
	}, DATA_UPDATE_RATE)

	// We create a new element each time the mode changes, to avoid SolidJS caching.
	const useElement = createMemo(() => {
		if (isMode("mse")) {
			const video = document.createElement("video")
			video.classList.add("w-full", "rounded-lg", "aspect-video")
			video.muted = true // so we can autoplay
			video.autoplay = true
			video.controls = true
			return video
		} else {
			const canvas = document.createElement("canvas")
			canvas.classList.add("w-full", "rounded-lg", "aspect-video")
			return canvas
		}
	})

	const [usePlayer, setPlayer] = createSignal<Player | undefined>()
	createEffect(() => {
		const namespace = props.name
		const url = `https://${server}`

		// Special case localhost to fetch the TLS fingerprint from the server.
		// TODO remove this when WebTransport correctly supports self-signed certificates
		const fingerprint = server.startsWith("localhost") ? `https://${server}/fingerprint` : undefined

		const element = useElement()
		Player.create({ url, fingerprint, element, namespace }).then(setPlayer).catch(setError)
	})

	createEffect(() => {
		const player = usePlayer()
		if (!player) return

		onCleanup(() => {
			player.close().then(setError).catch(setError)
			clearInterval(updateDataInterval)
		})
		player.closed().then(setError).catch(setError)
	})

	// NOTE: The canvas automatically has width/height set to the decoded video size.
	// TODO shrink it if needed via CSS
	return (
		<>
			<Fail error={error()} />
			{useElement()}

			<h3>Charts</h3>

			<Plot frames={frames()} />

			<h3>Meta Data</h3>
			<div class="flex items-center">
				<span>Current Time: &nbsp;</span>
				<p>
					{currentTime().toLocaleTimeString() +
						"." +
						currentTime().getMilliseconds().toString().padStart(3, "0")}
				</p>
			</div>

			<div class="flex items-center">
				<span>Video Time: &nbsp;</span>
				<p>{timeString()}</p>
			</div>

			<div class="flex items-center">
				<span>Total Bits Received: &nbsp;</span>
				<p>{formatNumber(totalAmountRecvBytes() * 8)}</p>
			</div>

			<div class="flex items-center">
				<span>Bitrate: &nbsp;</span>
				<p>{formatNumber(bitRate())} bps</p>
			</div>

			<div class="flex items-center">
				<span>Total Number of Frames Received: &nbsp;</span>
				<p>{frames().length}</p>
			</div>

			<div class="flex items-center">
				<span>Frames per Second: &nbsp;</span>
				<p>{framesPerSecond()}</p>
			</div>

			<h3>Advanced</h3>
			<button
				classList={{
					"bg-green-500": isMode("mse"),
					"hover:bg-green-600": isMode("mse"),
					"text-white": isMode("mse"),
				}}
				onClick={(e) => {
					setMode("mse")
					e.preventDefault()
				}}
				class="rounded-r-none border-r-2 border-r-slate-900"
			>
				Media Source <span class="block text-xs text-gray-200">(higher latency)</span>
			</button>
			<button
				classList={{
					"bg-green-500": isMode("webcodecs"),
					"hover:bg-green-600": isMode("webcodecs"),
					"text-white": isMode("webcodecs"),
				}}
				onClick={(e) => {
					setMode("webcodecs")
					e.preventDefault()
				}}
				class="rounded-l-none"
			>
				WebCodecs <span class="block text-xs text-gray-200">(experimental)</span>
			</button>
		</>
	)
}
