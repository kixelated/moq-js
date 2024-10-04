import { Broadcast, VideoEncoder, AudioEncoder } from "@kixelated/moq/contribute"
import { Client, Connection } from "@kixelated/moq/transfork"
import {
	createSignal,
	createEffect,
	onCleanup,
	createMemo,
	Show,
	For,
	createSelector,
	Switch,
	Match,
	onMount,
} from "solid-js"

import Fail from "./fail"

const AUDIO_CODECS = [
	"Opus",
	"mp4a", // TODO support AAC
]

interface VideoCodec {
	name: string
	profile: string
	value: string
}

// A list of codecs and profiles sorted in preferred order.
// TODO automate this list by looping over profile/level pairs
const VIDEO_CODECS: VideoCodec[] = [
	// HEVC Main10 Profile, Main Tier, Level 4.0
	{ name: "h.265", profile: "main", value: "hev1.2.4.L120.B0" },

	// AV1 Main Profile, level 3.0, Main tier, 8 bits
	{ name: "av1", profile: "main", value: "av01.0.04M.08" },

	// AVC High Level 3
	{ name: "h.264", profile: "high", value: "avc1.64001e" },

	// AVC High Level 4
	{ name: "h.264", profile: "high", value: "avc1.640028" },

	// AVC High Level 5
	{ name: "h.264", profile: "high", value: "avc1.640032" },

	// AVC High Level 5.2
	{ name: "h.264", profile: "high", value: "avc1.640034" },

	// AVC Main Level 3
	{ name: "h.264", profile: "main", value: "avc1.4d001e" },

	// AVC Main Level 4
	{ name: "h.264", profile: "main", value: "avc1.4d0028" },

	// AVC Main Level 5
	{ name: "h.264", profile: "main", value: "avc1.4d0032" },

	// AVC Main Level 5.2
	{ name: "h.264", profile: "main", value: "avc1.4d0034" },

	// AVC Baseline Level 3
	{ name: "h.264", profile: "baseline", value: "avc1.42001e" },

	// AVC Baseline Level 4
	{ name: "h.264", profile: "baseline", value: "avc1.420028" },

	// AVC Baseline Level 5
	{ name: "h.264", profile: "baseline", value: "avc1.420032" },

	// AVC Baseline Level 5.2
	{ name: "h.264", profile: "baseline", value: "avc1.420034" },
]

const SUPPORTED_HEIGHT = [240, 360, 480, 720, 1080, 1440]
const SUPPORTED_FPS = [15, 30, 60]

const DEFAULT_HEIGHT = 480
const DEFAULT_FPS = 30

export default function Publish() {
	// Use query params to allow overriding environment variables.
	const urlSearchParams = new URLSearchParams(window.location.search)
	const params = Object.fromEntries(urlSearchParams.entries())
	const server = params.server ?? import.meta.env.PUBLIC_RELAY_HOST

	const [device, setDevice] = createSignal<MediaStream | undefined>()
	const [deviceLoading, setDeviceLoading] = createSignal(false)
	const [audio, setAudio] = createSignal<AudioEncoderConfig | undefined>()
	const [video, setVideo] = createSignal<VideoEncoderConfig | undefined>()
	const [connection, setConnection] = createSignal<Connection | undefined>()
	const [advanced, setAdvanced] = createSignal(false)
	const [broadcast, setBroadcast] = createSignal<Broadcast | undefined>()
	const [copied, setCopied] = createSignal<boolean>()
	const [active, setActive] = createSignal<boolean>()
	const [error, setError] = createSignal<Error | undefined>()

	const audioTrack = createMemo(() => {
		const tracks = device()?.getAudioTracks()
		if (!tracks || tracks.length == 0) return
		return tracks[0].getSettings() as AudioTrackSettings
	})

	const videoTrack = createMemo(() => {
		const tracks = device()?.getVideoTracks()
		if (!tracks || tracks.length == 0) return
		return tracks[0].getSettings() as VideoTrackSettings
	})

	const name = crypto.randomUUID()
	let watchUrl = `/watch/${name}`
	if (server != import.meta.env.PUBLIC_RELAY_HOST) {
		watchUrl = `${watchUrl}?server=${server}`
	}

	createEffect(() => {
		const url = `https://${server}`

		// Special case localhost to fetch the TLS fingerprint from the server.
		// TODO remove this when WebTransport correctly supports self-signed certificates
		const fingerprint = server.startsWith("localhost") ? `https://${server}/fingerprint` : undefined

		const client = new Client({
			url,
			fingerprint,
		})

		client.connect().then(setConnection).catch(setError)
	})

	const createBroadcast = function () {
		const d = device()
		if (!d) {
			throw new Error("no input selected")
		}

		const a = audio()
		if (!a && audioTrack()) {
			throw new Error("no supported audio codec")
		}

		const v = video()
		if (!v && videoTrack()) {
			throw new Error("no supported video codec")
		}

		return new Broadcast({
			name: name,
			media: d,
			audio: a,
			video: v,
		})
	}

	createEffect(() => {
		if (!active()) return

		try {
			setBroadcast(createBroadcast())
		} catch (e) {
			setError(e as Error)
			setActive(false)
		}
	})

	createEffect(() => {
		const conn = connection()
		if (!conn) return

		const b = broadcast()
		if (!b) return

		b.publish(conn).catch(setError)
	})

	// Close the connection on unload
	createEffect(() => {
		const conn = connection()
		if (!conn) return

		onCleanup(() => conn.close())
		conn.closed().then(setError, setError)
	})

	// The text for the submit button
	const status = createMemo(() => {
		if (!device()) {
			if (deviceLoading()) return "device-loading"
			return "device-none"
		}

		if (!active()) return "ready"
		if (!connection()) return "connect"
		return "live"
	})

	const isStatus = createSelector(status)

	// Copy the link to the clipboard
	const copyShare = function (event: MouseEvent) {
		event.preventDefault()

		const target = event.currentTarget
		if (!target || !(target instanceof HTMLAnchorElement)) return

		const relative = target.getAttribute("href")
		if (!relative) return

		// Compute the absolute URL
		const absolute = new URL(relative, window.location.href).href

		navigator.clipboard
			.writeText(absolute)
			.then(() => setCopied(true))
			.catch((err) => console.error("failed to copy link:", err))
	}

	// Hide the copied message after a few seconds
	createEffect(() => {
		if (!copied()) return
		const timeout = setTimeout(() => setCopied(false), 4000)
		onCleanup(() => clearTimeout(timeout))
	})

	return (
		<>
			<form onSubmit={(e) => e.preventDefault()}>
				<Device setError={setError} setDevice={setDevice} setDeviceLoading={setDeviceLoading} />

				<Show when={videoTrack()}>
					{(track) => (
						<Video setError={setError} setConfig={setVideo} track={track()} advanced={advanced()} />
					)}
				</Show>

				<Show when={audioTrack()}>
					{(track) => (
						<Audio setError={setError} setConfig={setAudio} track={track()} advanced={advanced()} />
					)}
				</Show>

				<div class="h-12" />

				<Fail error={error()} />

				<div class="flex flex-wrap items-center gap-4">
					<button
						type="submit"
						onClick={(e) => {
							e.preventDefault()

							if (isStatus("ready")) {
								setActive(true)
							}
						}}
						classList={{
							"bg-yellow-500": !isStatus("ready") && !isStatus("live"),
							"hover:bg-yellow-600": !isStatus("ready") && !isStatus("live"),
							"bg-green-500": isStatus("ready") || isStatus("live"),
							"hover:bg-green-600": isStatus("ready") || isStatus("live"),
						}}
						class="text-white"
					>
						<Switch>
							<Match when={isStatus("device-none")}>Select Device</Match>
							<Match when={isStatus("device-loading")}>Loading Device</Match>
							<Match when={isStatus("ready")}>Go Live</Match>
							<Match when={isStatus("connect")}>Connecting</Match>
							<Match when={isStatus("live")}>Live</Match>
						</Switch>
					</button>

					<Show when={device() && !broadcast()}>
						<p>
							<button
								onClick={(e) => {
									setAdvanced((toggle) => !toggle)
									e.preventDefault()
								}}
							>
								<Show when={advanced()} fallback="Show Advanced">
									Hide Advanced
								</Show>
							</button>
						</p>
					</Show>

					<Show when={broadcast()}>
						<a href={watchUrl} onClick={copyShare} class="form-button">
							Share
						</a>
					</Show>

					<Show when={copied()}>
						<span class="text-slate-300">Link copied to clipboard</span>
					</Show>
				</div>
			</form>
		</>
	)
}

function Device(props: {
	setError: (err: Error) => void
	setDevice: (input: MediaStream) => void
	setDeviceLoading: (ok: boolean) => void
}) {
	const [mode, setMode] = createSignal<"user" | "display" | "none">("none")
	const [device, setDevice] = createSignal<MediaStream | undefined>()
	const [videoDeviceId, setVideoDeviceId] = createSignal<string>("")
	const [audioDeviceId, setAudioDeviceId] = createSignal<string>("")
	const [orientation, setOrientation] = createSignal({
		landscape: true,
		alpha: 0,
		beta: 0,
		gamma: 0,
	})

	const handleOrientation = (event: unknown) => {
		const typedEvent = event as { alpha: number; beta: number; gamma: number }
		let isLandscape = true
		if (typedEvent.beta > 40 || typedEvent.beta < -45) {
			isLandscape = false
		}
		const orient = {
			landscape: isLandscape,
			alpha: typedEvent.alpha,
			beta: typedEvent.beta,
			gamma: typedEvent.gamma,
		}
		setOrientation(orient)
		//console.log(orient)
	}

	onMount(() => {
		window.addEventListener("deviceorientation", handleOrientation)
		onCleanup(() => {
			window.removeEventListener("deviceorientation", handleOrientation)
		})
	})

	let preview: HTMLVideoElement | undefined // undefined until mount

	const loadUser = function () {
		setMode("user")
		setDevice(undefined)
		props.setDeviceLoading(true)

		mediaDevices()
			.then(setDevice)
			.catch(props.setError)
			.catch(() => setMode("none"))
			.finally(() => props.setDeviceLoading(false))
	}

	const loadDisplay = function () {
		setMode("display")
		setDevice(undefined)
		props.setDeviceLoading(true)
		const orient = orientation()
		const videoTrackConstraints: MediaTrackConstraints = {
			height: { ideal: DEFAULT_HEIGHT }, // max not supported
			frameRate: { ideal: DEFAULT_FPS }, // max not supported
		}
		if (orient.landscape) {
			videoTrackConstraints.aspectRatio = { ideal: 16 / 9 }
		}
		navigator.mediaDevices
			.getDisplayMedia({
				audio: {
					channelCount: {
						ideal: 2,
						max: 2,
					},
					sampleRate: { ideal: 48_000 },
				},
				video: videoTrackConstraints,
			})
			.then(setDevice)
			.catch(props.setError)
			.catch(() => setMode("none"))
			.finally(() => props.setDeviceLoading(false))
	}

	const mediaDevices = () => {
		const orient = orientation()
		const videoTrackConstraints: MediaTrackConstraints = {
			height: { ideal: DEFAULT_HEIGHT, max: SUPPORTED_HEIGHT.at(-1) },
			frameRate: { ideal: DEFAULT_FPS, max: SUPPORTED_FPS.at(-1) },
			deviceId: videoDeviceId(),
		}
		if (orient.landscape) {
			videoTrackConstraints.aspectRatio = { ideal: 16 / 9 }
		}
		return navigator.mediaDevices.getUserMedia({
			audio:
				audioDeviceId() === "disabled"
					? false
					: {
							channelCount: {
								ideal: 2,
								max: 2,
							},
							sampleRate: { ideal: 48_000 },
							deviceId: audioDeviceId(),
					  },
			video: videoDeviceId() === "disabled" ? false : videoTrackConstraints,
		})
	}

	const updateDeviceInput = function (videoDevId: string, audioDevId: string) {
		setVideoDeviceId(videoDevId)
		setAudioDeviceId(audioDevId)
		mediaDevices()
			.then(setDevice)
			.catch(props.setError)
			.catch(() => setMode("none"))
	}

	const deviceInputError = function (err: Error) {
		props.setError(err)
		setMode("none")
	}

	// Preview the input source.
	createEffect(() => {
		const d = device()
		if (!d) return

		if (preview) preview.srcObject = d
		props.setDevice(d)

		// Stop on cleanup
		onCleanup(() => d.getTracks().forEach((track) => track.stop()))
	})

	const isMode = createSelector(mode)

	return (
		<>
			<h2>Source</h2>

			<div>Choose an input device:</div>
			<button
				classList={{
					"bg-green-500": isMode("user"),
					"hover:bg-green-600": isMode("user"),
					"text-white": isMode("user"),
				}}
				onClick={(e) => {
					loadUser()
					e.preventDefault()
				}}
				class="rounded-r-none border-r-2 border-r-slate-900"
			>
				Camera
			</button>
			<button
				classList={{
					"bg-green-500": isMode("display"),
					"hover:bg-green-600": isMode("display"),
					"text-white": isMode("user"),
				}}
				onClick={(e) => {
					loadDisplay()
					e.preventDefault()
				}}
				class="rounded-l-none"
			>
				Window
			</button>

			<Show when={mode() === "user"}>
				<DeviceList
					onChange={updateDeviceInput}
					onError={deviceInputError}
					videoDeviceId={videoDeviceId()}
					audioDeviceId={audioDeviceId()}
				/>
			</Show>

			<Show when={device()}>
				<video autoplay muted class="rounded-md" ref={preview} />
			</Show>
		</>
	)
}

function DeviceList(props: {
	videoDeviceId: string
	audioDeviceId: string
	onChange: (videoDeviceId: string, audioDeviceId: string) => void
	onError: (err: Error) => void
}) {
	const [devices, setDevices] = createSignal<MediaDeviceInfo[]>([])

	createEffect(() => {
		navigator.mediaDevices.enumerateDevices().then(setDevices).catch(props.onError)
	})

	const changeVideoDeviceId = function (videoDeviceId: string) {
		props.onChange(videoDeviceId, props.audioDeviceId)
	}

	const changeAudioDeviceId = function (audioDeviceId: string) {
		props.onChange(props.videoDeviceId, audioDeviceId)
	}

	return (
		<div class="my-8 flex flex-wrap items-center gap-8">
			<label>
				Video Input
				<select name="video-input" class="block w-64" onInput={(e) => changeVideoDeviceId(e.target.value)}>
					<For each={[...devices().filter((d) => d.kind === "videoinput")]}>
						{(device, i) => {
							return (
								<option
									value={device.deviceId}
									selected={
										(props.videoDeviceId === "" && i() === 0) ||
										props.videoDeviceId === device.deviceId
									}
								>
									{device.label}
								</option>
							)
						}}
					</For>
					<option value="disabled" selected={props.videoDeviceId === "disabled"}>
						Disabled
					</option>
				</select>
			</label>

			<label>
				Audio Input
				<select name="audio-input" class="block w-64" onInput={(e) => changeAudioDeviceId(e.target.value)}>
					<For each={[...devices().filter((d) => d.kind === "audioinput")]}>
						{(device, i) => {
							return (
								<option
									value={device.deviceId}
									selected={
										(props.videoDeviceId === "" && i() === 0) ||
										props.audioDeviceId === device.deviceId
									}
								>
									{device.label}
								</option>
							)
						}}
					</For>
					<option value="disabled" selected={props.audioDeviceId === "disabled"}>
						Disabled
					</option>
				</select>
			</label>
		</div>
	)
}

function Video(props: {
	setError: (err: Error) => void
	setConfig: (config: VideoEncoderConfig | undefined) => void
	track: VideoTrackSettings
	advanced: boolean
}) {
	const supportedHeight = createMemo(() => {
		const options = SUPPORTED_HEIGHT.filter((h) => h <= props.track.height)

		// Use the device height by default
		if (options.indexOf(props.track.height) == -1) {
			options.push(props.track.height)
			options.sort()
		}

		return options
	})

	const supportedFps = createMemo(() => {
		const options = SUPPORTED_FPS.filter((f) => f <= props.track.frameRate)

		// Use the device framerate by default
		if (options.indexOf(props.track.frameRate) == -1) {
			options.push(props.track.frameRate)
			options.sort()
		}

		return options
	})

	// Default values
	const [height, setHeight] = createSignal(0) // use track default
	const [fps, setFps] = createSignal(0) // use fps default
	const [bitrate, setBitrate] = createSignal(2_000_000)
	const [codec, setCodec] = createSignal("")
	const [profile, setProfile] = createSignal("")
	const [supported, setSupported] = createSignal<VideoCodec[]>()

	// Compute the width based on the aspect ratio.
	const width = (height: number) => {
		// Round to the nearest multiple of 2.
		return 2 * Math.ceil((height * props.track.width) / props.track.height / 2)
	}

	// Make sure the selected value is a supported height/fps
	createEffect(() => {
		const h = height()
		if (supportedHeight().indexOf(h) == -1) {
			setHeight(props.track.height)
		}
	})

	createEffect(() => {
		const f = fps()
		if (supportedFps().indexOf(f) == -1) {
			setFps(props.track.frameRate)
		}
	})

	// Fetch the list of supported codecs.
	createEffect(() => {
		const isSupported = async (codec: VideoCodec, hardwareAcceleration: HardwareAcceleration) => {
			const supported = await VideoEncoder.isSupported({
				codec: codec.value,
				width: width(height()),
				height: height(),
				framerate: fps(),
				bitrate: bitrate(),
				hardwareAcceleration,
			})

			if (supported) return codec
		}

		// Call isSupported on each codec.
		//
		// The resulting array is sorted in descending priority order, with devices supporting hardware acceleration
		// preferred but other devices included for browser compat (specifically Chrome on Linux).
		const promises = [
			...VIDEO_CODECS.map((codec) => isSupported(codec, "prefer-hardware")),
			...VIDEO_CODECS.map((codec) => isSupported(codec, "prefer-software")),
		]

		// Wait for all of the promises to return
		Promise.all(promises)
			.then((codecs) => {
				// Remove any undefined values, using this syntax so Typescript knows they aren't undefined
				return codecs.filter((codec): codec is VideoCodec => !!codec)
			})
			.then(setSupported)
			.catch(props.setError)
	})

	// Return supported codec names in preference order.
	const supportedCodecNames = createMemo(() => {
		const unique = new Set<string>()
		for (const codec of supported() || []) {
			if (!unique.has(codec.name)) unique.add(codec.name)
		}
		return [...unique]
	})

	// Returns supported codec profiles in preference order.
	const supportedCodecProfiles = createMemo(() => {
		const unique = new Set<string>()
		for (const valid of supported() || []) {
			if (valid.name == codec() && !unique.has(valid.profile)) unique.add(valid.profile)
		}
		return [...unique]
	})

	// Update the config with a valid config
	const config = createMemo(() => {
		const available = supported()
		if (!available) return

		const valid = available.find((supported) => {
			return supported.name == codec() && supported.profile == profile()
		})

		if (valid) {
			// The codec is valid; use it
			return {
				codec: valid.value,
				height: height(),
				width: width(height()),
				bitrate: bitrate(),
				framerate: fps(),
			}
		}

		// We didn't find a valid codec, so default to the first supported one.
		const defaultCodec = supported()?.at(0)
		if (defaultCodec) {
			setCodec(defaultCodec.name)
			setProfile(defaultCodec.profile)
		}
	})

	createEffect(() => props.setConfig(config()))

	return (
		<>
			<Show when={props.advanced}>
				<h2>Video</h2>

				<div class="flex flex-wrap items-center gap-8">
					<label>
						Codec
						<select name="codec" class="block w-64" onInput={(e) => setCodec(e.target.value)}>
							<For each={supportedCodecNames()}>
								{(value) => (
									<option value={value} selected={value === codec()}>
										{value}
									</option>
								)}
							</For>
						</select>
					</label>

					<label>
						Profile
						<select name="profile" class="block w-64" onInput={(e) => setProfile(e.target.value)}>
							<For each={supportedCodecProfiles()}>
								{(value) => (
									<option value={value} selected={value === profile()}>
										{value}
									</option>
								)}
							</For>
						</select>
					</label>

					<label>
						Resolution
						<select
							class="block w-64"
							name="resolution"
							onInput={(e) => setHeight(parseInt(e.target.value))}
						>
							<For each={supportedHeight()}>
								{(value) => (
									<option value={value} selected={value === height()}>
										{width(value)} x {value}
									</option>
								)}
							</For>
						</select>
					</label>

					<label>
						Frame Rate
						<select name="fps" class="block w-64" onInput={(e) => setFps(parseInt(e.target.value))}>
							<For each={supportedFps()}>
								{(value) => (
									<option value={value} selected={value === fps()}>
										{value}fps
									</option>
								)}
							</For>
						</select>
					</label>

					<label>
						Bitrate: <span class="text-slate-400">{(bitrate() / 1_000_000).toFixed(1)} Mb/s</span>
						<input
							type="range"
							name="bitrate"
							class="block w-64"
							min={500_000}
							max={4_000_000}
							step={100_000}
							value={bitrate()}
							onInput={(e) => setBitrate(parseInt(e.target.value))}
						/>
					</label>
				</div>
			</Show>
		</>
	)
}

function Audio(props: {
	setError: (err: Error) => void
	setConfig: (config: AudioEncoderConfig | undefined) => void
	track: AudioTrackSettings
	advanced: boolean
}) {
	// Default values
	const [codec, setCodec] = createSignal("")
	const [bitrate, setBitrate] = createSignal(128_000)
	const [supported, setSupported] = createSignal<string[]>([])

	// Fetch the list of supported codecs.
	createEffect(() => {
		const isSupported = async (config: AudioEncoderConfig) => {
			const supported = await AudioEncoder.isSupported(config)
			if (supported) return config
		}

		// Call isSupported on each codec
		const promises = AUDIO_CODECS.map((codec) =>
			isSupported({
				codec,
				bitrate: bitrate(),
				numberOfChannels: props.track.channelCount,
				sampleRate: props.track.sampleRate,
			}),
		)

		// Wait for all of the promises to return
		Promise.all(promises)
			.then((configs) => configs.filter((config) => config))
			.then((configs) => configs.map((config) => config?.codec ?? "")) // it won't be ""
			.then(setSupported)
			.catch(props.setError)
	})

	// Update the config with a valid config
	const config = createMemo(() => {
		const available = supported()
		if (!available) return

		if (available.indexOf(codec()) != -1) {
			// The selected codec is valid
			return {
				codec: codec(),
				bitrate: bitrate(),
				numberOfChannels: props.track.channelCount,
				sampleRate: props.track.sampleRate,
			}
		}

		const defaultCodec = available.at(0)
		if (defaultCodec) {
			setCodec(defaultCodec)
		}
	})

	createEffect(() => props.setConfig(config()))

	return (
		<>
			<Show when={props.advanced}>
				<h2>Audio</h2>
				<div class="flex flex-wrap items-center gap-8">
					<label>
						Codec
						<select class="block w-64" name="codec" onInput={(e) => setCodec(e.target.value)}>
							<For each={supported()}>
								{(value) => (
									<option value={value} selected={value === codec()}>
										{value}
									</option>
								)}
							</For>
						</select>
					</label>

					<label>
						Bitrate: <span class="text-slate-300">{Math.floor(bitrate() / 1000)} Kb/s</span>
						<input
							type="range"
							name="bitrate"
							class="block w-64"
							min={64_000}
							max={256_000}
							step={1_000}
							value={bitrate()}
							onInput={(e) => setBitrate(parseInt(e.target.value))}
						/>
					</label>
				</div>
			</Show>
		</>
	)
}

// These are a subset of MediaTrackSettings so I don't have to deal with undefined

interface AudioTrackSettings {
	autoGainControl: boolean
	channelCount: number
	deviceId: string
	echoCancellation: boolean
	facingMode: string
	groupId: string
	noiseSuppression: boolean
	sampleRate: number
	sampleSize: number
}

interface VideoTrackSettings {
	aspectRatio: number
	deviceId: string
	displaySurface: string
	facingMode: string
	frameRate: number
	groupId: string
	height: number
	width: number
}
