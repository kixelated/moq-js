/* eslint-disable jsx-a11y/media-has-caption */
import { Player } from "@kixelated/moq/playback"

import { IndexedDBObjectStores } from "@kixelated/moq/contribute"
import type { IndexedDBFramesSchema } from "@kixelated/moq/contribute"

import Plot from "./bitChart"

import Fail from "./fail"

import { createEffect, createMemo, createSelector, createSignal, onCleanup } from "solid-js"

export interface IndexedDBFBitRateWithTimestampSchema {
	bitrate: number
	timestamp: number
}

// Data update rate in milliseconds
const DATA_UPDATE_RATE = 500

// Helper function to nicely display large numbers
function formatNumber(number: number): string {
	const suffixes = ["", "k", "M", "B", "T"] // Add more suffixes as needed
	const suffixIndex = Math.floor(Math.log10(number) / 3)
	const scaledNumber = number / Math.pow(10, suffixIndex * 3)
	const suffix = suffixes[suffixIndex]
	return scaledNumber.toFixed(2) + suffix
}

// Utility function to download collected data.
function downloadData(data: IndexedDBFramesSchema[]): void {
	const jsonData = JSON.stringify(data)
	const blob = new Blob([jsonData], {
		type: "application/json",
	})

	const link = document.createElement("a")
	link.href = URL.createObjectURL(blob)
	link.download = "frame_metadata"

	// Append the link to the body
	document.body.appendChild(link)

	// Programmatically click the link to trigger the download
	link.click()

	// Clean up
	document.body.removeChild(link)
}

let db: IDBDatabase // Declare db variable at the worker scope

// Open or create a database
const openRequest = indexedDB.open("IndexedDB", 1)

// Handle the success event when the database is successfully opened
openRequest.onsuccess = (event) => {
	db = (event.target as IDBOpenDBRequest).result // Assign db when database is opened
}

// Function to retrieve all frame data from IndexedDB
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
	const [allFrames, setAllFrames] = createSignal<IndexedDBFramesSchema[]>([])
	const [receivedFrames, setReceivedFrames] = createSignal<IndexedDBFramesSchema[]>([])
	const [firstReceviedFrameIndex, setFirstReceivedFrameIndex] = createSignal<number>(0)
	const [lastReceviedFrameIndex, setLastReceivedFrameIndex] = createSignal<number>(0)
	const [percentageReceivedFrames, setPercentageReceivedFrames] = createSignal<number>(0.0)
	const [minContainerizationTime, setMinContainerizationTime] = createSignal<number>(0)
	const [maxContainerizationTime, setMaxContainerizationTime] = createSignal<number>(0)
	const [avgContainerizationTime, setAvgContainerizationTime] = createSignal<number>(0.0)
	const [minPropagationTime, setMinPropagationTime] = createSignal<number>(0)
	const [maxPropagationTime, setMaxPropagationTime] = createSignal<number>(0)
	const [avgPropagationTime, setAvgPropagationTime] = createSignal<number>(0.0)
	const [minRenderTime, setMinRenderTime] = createSignal<number>(0)
	const [maxRenderTime, setMaxRenderTime] = createSignal<number>(0)
	const [avgRenderTime, setAvgRenderTime] = createSignal<number>(0.0)
	const [minTotalTime, setMinTotalTime] = createSignal<number>(0)
	const [maxTotalTime, setMaxTotalTime] = createSignal<number>(0)
	const [avgTotalTime, setAvgTotalTime] = createSignal<number>(0.0)
	const [bitratePlotData, setBitratePlotData] = createSignal<IndexedDBFBitRateWithTimestampSchema[]>([])
	const [watchTime, setWatchTime] = createSignal<number>(0)
	const [timeString, setTimeString] = createSignal<string>("00:00:00:000")
	const [bitRate, setBitRate] = createSignal<number>(0.0)
	const [framesPerSecond, setFramesPerSecond] = createSignal<number>(0.0)

	// Define a function to update the data every second
	const updateDataInterval = setInterval(() => {
		// Function to retrieve data from the IndexedDB
		const retrieveData = async () => {
			const frames = await retrieveFramesFromIndexedDB()

			// Ignore first few frames since none of these frames will acutally be received
			const firstReceviedFrame =
				frames.slice(10).findIndex((frame) => frame._5_receiveMp4FrameTimestamp !== undefined) + 10
			// console.log("FIRST_RECEVIED_FRAME_INDEX", firstReceviedFrame)

			const lastReceviedFrame =
				frames.slice(10).findLastIndex((frame) => frame._5_receiveMp4FrameTimestamp !== undefined) + 10
			// console.log("LAST_RECEVIED_FRAME_INDEX", lastReceviedFrame)

			const allReceivedFrames = frames
				.slice(firstReceviedFrame)
				.filter((frame) => frame._5_receiveMp4FrameTimestamp !== undefined)

			setAllFrames(frames)
			setReceivedFrames(allReceivedFrames)
			setFirstReceivedFrameIndex(firstReceviedFrame)
			setLastReceivedFrameIndex(lastReceviedFrame)
			setPercentageReceivedFrames(allReceivedFrames.length / frames.slice(firstReceviedFrame).length)

			let totalAmountRecvBytes = 0
			let minContainerizationTime = Number.MAX_SAFE_INTEGER
			let maxContainerizationTime = Number.MIN_SAFE_INTEGER
			let sumContainerizationTime = 0
			let minPropagationTime = Number.MAX_SAFE_INTEGER
			let maxPropagationTime = Number.MIN_SAFE_INTEGER
			let sumPropagationTime = 0
			let minRenderTime = Number.MAX_SAFE_INTEGER
			let maxRenderTime = Number.MIN_SAFE_INTEGER
			let sumRenderTime = 0
			let minTotalTime = Number.MAX_SAFE_INTEGER
			let maxTotalTime = Number.MIN_SAFE_INTEGER
			let sumTotalTime = 0
			allReceivedFrames.forEach((frame) => {
				totalAmountRecvBytes += frame._14_receivedBytes
				const frameContainerizationTime = frame._2_containerizationTime
				if (frameContainerizationTime < minContainerizationTime) {
					minContainerizationTime = frameContainerizationTime
				}
				if (frameContainerizationTime > maxContainerizationTime) {
					maxContainerizationTime = frameContainerizationTime
				}
				if (frameContainerizationTime) {
					sumContainerizationTime += frameContainerizationTime
				}

				const framePropagationTime = frame._4_propagationTime
				if (framePropagationTime < minPropagationTime) {
					minPropagationTime = framePropagationTime
				}
				if (framePropagationTime > maxPropagationTime) {
					maxPropagationTime = framePropagationTime
				}
				if (framePropagationTime) {
					sumPropagationTime += framePropagationTime
				}

				const frameRenderTime = frame._6_renderFrameTime
				if (frameRenderTime < minRenderTime) {
					minRenderTime = frameRenderTime
				}
				if (frameRenderTime > maxRenderTime) {
					maxRenderTime = frameRenderTime
				}
				if (frameRenderTime) {
					sumRenderTime += frameRenderTime
				}

				const frameTotalTime = frame._8_totalTime
				if (frameTotalTime < minTotalTime) {
					minTotalTime = frameTotalTime
				}
				if (frameTotalTime > maxTotalTime) {
					maxTotalTime = frameTotalTime
				}
				if (frameTotalTime) {
					sumTotalTime += frameTotalTime
				}
			})

			setTotalAmountRecvBytes(totalAmountRecvBytes)

			setMinContainerizationTime(minContainerizationTime)
			setMaxContainerizationTime(maxContainerizationTime)
			setAvgContainerizationTime(sumContainerizationTime / allReceivedFrames.length)

			setMinPropagationTime(minPropagationTime)
			setMaxPropagationTime(maxPropagationTime)
			setAvgPropagationTime(sumPropagationTime / allReceivedFrames.length)

			setMinRenderTime(minRenderTime)
			setMaxRenderTime(maxRenderTime)
			setAvgRenderTime(sumRenderTime / allReceivedFrames.length)

			setMinTotalTime(minTotalTime)
			setMaxTotalTime(maxTotalTime)
			setAvgTotalTime(sumTotalTime / allReceivedFrames.length)
		}

		retrieveData().then(setError).catch(setError)

		setCurrentTime(new Date())

		const totalMillisecondsWatched = watchTime() + DATA_UPDATE_RATE
		setWatchTime(totalMillisecondsWatched)
		const totalSeconds = Math.floor(totalMillisecondsWatched / 1000)

		setBitRate(parseFloat(((totalAmountRecvBytes() * 8) / totalSeconds).toFixed(2)))
		setFramesPerSecond(parseFloat((receivedFrames().length / totalSeconds).toFixed(2)))

		const hours = Math.floor(totalMillisecondsWatched / 3600000) // 1 hour = 3600000 milliseconds
		const minutes = Math.floor((totalMillisecondsWatched % 3600000) / 60000) // 1 minute = 60000 milliseconds
		const seconds = Math.floor((totalMillisecondsWatched % 60000) / 1000) // 1 second = 1000 milliseconds
		const milliseconds = Math.floor(totalMillisecondsWatched % 1000) // Remaining milliseconds

		// Format the time
		const formattedTime = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(
			seconds,
		).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`
		setTimeString(formattedTime)

		// setBitratePlotData(bitratePlotData().concat([{ bitrate: bitRate(), timestamp: totalMilliseconds - 3600000 }]))
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

			{/* <h3>Charts</h3> */}

			{/* <Plot bitrateWithTimestamp={bitratePlotData()} /> */}

			<h3>Meta Data</h3>
			<div class="flex">
				<div class="mr-20 flex items-center">
					<span>Current Time: &nbsp;</span>
					<p>
						{currentTime().toLocaleTimeString() +
							"." +
							currentTime().getMilliseconds().toString().padStart(3, "0")}
					</p>
				</div>

				<div class="flex items-center">
					<span>Time Watching: &nbsp;</span>
					<p>{timeString()}</p>
				</div>
			</div>

			<div class="flex">
				<div class="mr-20 flex items-center">
					<span>Total Bits Received: &nbsp;</span>
					<p>{formatNumber(totalAmountRecvBytes() * 8)}</p>
				</div>

				<div class="flex items-center">
					<span>Bitrate: &nbsp;</span>
					<p>{formatNumber(bitRate())} bps</p>
				</div>
			</div>

			<div class="flex">
				<div class="mr-20 flex items-center">
					<span>Total Frames Received: &nbsp;</span>
					<p>{receivedFrames().length}</p>
				</div>

				<div class="mr-20 flex items-center">
					<span>Percentage of Frames Received: &nbsp;</span>
					<p>{(percentageReceivedFrames() * 100).toFixed(2)}%</p>
				</div>

				<div class="flex items-center">
					<span>Frame Rate: &nbsp;</span>
					<p>{framesPerSecond()} fps</p>
				</div>
			</div>

			<div class="grid grid-cols-4 gap-5 border">
				<div class="p-5 text-center" />
				<div class="p-5 text-center">Min</div>
				<div class="p-5 text-center">Max</div>
				<div class="p-5 text-center">Avg</div>

				<div class="p-5 text-center">Containerization Time:</div>
				<div class="p-5 text-center">{minContainerizationTime()}</div>
				<div class="p-5 text-center">{maxContainerizationTime()}</div>
				<div class="p-5 text-center">{avgContainerizationTime().toFixed(2)}</div>

				<div class="p-5 text-center">Propagation Time:</div>
				<div class="p-5 text-center">{minPropagationTime()}</div>
				<div class="p-5 text-center">{maxPropagationTime()}</div>
				<div class="p-5 text-center">{avgPropagationTime().toFixed(2)}</div>

				<div class="p-5 text-center">Render Time:</div>
				<div class="p-5 text-center">{minRenderTime()}</div>
				<div class="p-5 text-center">{maxRenderTime()}</div>
				<div class="p-5 text-center">{avgRenderTime().toFixed(2)}</div>

				<div class="p-5 text-center">Total Time:</div>
				<div class="p-5 text-center">{minTotalTime()}</div>
				<div class="p-5 text-center">{maxTotalTime()}</div>
				<div class="p-5 text-center">{avgTotalTime().toFixed(2)}</div>
			</div>

			<button class="bg-cyan-600" onClick={() => downloadData(allFrames())}>
				Download data
			</button>

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
