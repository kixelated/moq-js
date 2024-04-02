/* eslint-disable jsx-a11y/media-has-caption */
import { Player } from "@kixelated/moq/playback"

import Fail from "./fail"

import { createEffect, createMemo, createSelector, createSignal, onCleanup } from "solid-js"

interface IndexedDBSchema {
	id: number
	value: number
}

// Helper function to nicely display large numbers
function formatNumber(number: number): string {
	const suffixes = ["", "k", "M", "B", "T"] // Add more suffixes as needed
	const suffixIndex = Math.floor(Math.log10(number) / 3)
	const scaledNumber = number / Math.pow(10, suffixIndex * 3)
	const suffix = suffixes[suffixIndex]
	return scaledNumber.toFixed(2) + suffix
}

// Only for testing the reactive UI, can be removed later
function useCurrentTime() {
	const [currentTime, setCurrentTime] = createSignal<string>(getCurrentTime())

	// Update the current time every second
	const intervalId = setInterval(() => {
		setCurrentTime(getCurrentTime())
	}, 1000)

	// Clean up the interval when the component unmounts
	onCleanup(() => {
		clearInterval(intervalId)
	})

	return currentTime
}

function getCurrentTime(): string {
	const now = new Date()
	return now.toLocaleTimeString()
}

let db: IDBDatabase // Declare db variable at the worker scope

// Open or create a database
const openRequest = indexedDB.open("myStore", 2)

// Handle the success event when the database is successfully opened
openRequest.onsuccess = (event) => {
	db = (event.target as IDBOpenDBRequest).result // Assign db when database is opened
}

// Function to retrieve all stored values from IndexedDB
function retrieveDataFromIndexedDB(): Promise<IndexedDBSchema[]> {
	return new Promise((resolve, reject) => {
		if (!db) {
			reject(new Error("IndexedDB is not initialized."))
			return
		}

		const transaction = db.transaction(["myStore"], "readonly")
		const objectStore = transaction.objectStore("myStore")
		const getRequest = objectStore.getAll() // Get all stored values from the database

		// Handle the success event when the values are retrieved successfully
		getRequest.onsuccess = (event) => {
			const storedValues = (event.target as IDBRequest).result as IndexedDBSchema[]
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
	const currentTime = useCurrentTime()

	const [totalAmountRecvBytes, setTotalAmountRecvBytes] = createSignal<number>(0)
	const [frameCounter, setFrameCounter] = createSignal<number>(0)
	const [secondSignal, setSecondSignal] = createSignal<number>(0)
	const [timeString, setTimeString] = createSignal<string>("00:00:00")
	const [bitRate, setBitRate] = createSignal<number>(0.0)
	const [framesPerSecond, setFramesPerSecond] = createSignal<number>(0.0)

	// Define a function to update the data every second
	function updateDataCallback() {
		setSecondSignal(secondSignal() + 1)

		// Function to retrieve data from the IndexedDB
		const retrieveData = async () => {
			const data = await retrieveDataFromIndexedDB()
			setTotalAmountRecvBytes(data[0].value)
			setFrameCounter(data[1].value)
		}
		retrieveData().then(setError).catch(setError)

		setBitRate(parseFloat(((totalAmountRecvBytes() * 8) / secondSignal()).toFixed(2)))
		setFramesPerSecond(parseFloat((frameCounter() / secondSignal()).toFixed(2)))

		const hours = Math.floor(secondSignal() / 3600) // 1 hour = 3600000 milliseconds
		const minutes = Math.floor((secondSignal() % 3600) / 60) // 1 minute = 60000 milliseconds
		const seconds = Math.floor(secondSignal() % 60) // 1 second = 1000 milliseconds
		// Format the time
		const formattedTime = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(
			seconds,
		).padStart(2, "0")}`
		setTimeString(formattedTime)
	}

	// Start the timer
	const updateDataInterval = setInterval(updateDataCallback, 1000) // 1000 milliseconds = 1 second

	// Close all intervals
	setTimeout(() => {
		clearInterval(updateDataInterval)
	}, 30000)

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

		onCleanup(() => player.close())
		player.closed().then(setError).catch(setError)
	})

	// NOTE: The canvas automatically has width/height set to the decoded video size.
	// TODO shrink it if needed via CSS
	return (
		<>
			<Fail error={error()} />
			{useElement()}

			<h3>Meta Data</h3>
			<div class="flex items-center">
				<span>Current Time: &nbsp;</span>
				<p>{currentTime()}</p>
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
				<p>{formatNumber(frameCounter())}</p>
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
