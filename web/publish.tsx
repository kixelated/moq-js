import { Broadcast, VideoEncoder, AudioEncoderCodecs } from "@kixelated/moq/contribute"

import { createEffect, createSignal, For, createResource, Show, Switch, Match, createMemo, onCleanup } from "solid-js"
import { SetStoreFunction, Store, createStore } from "solid-js/store"
import { useSearchParams } from "@solidjs/router"

import { Listing } from "./listing"
import { createFetch } from "./common"
import { Client } from "@kixelated/moq/transport"
import { Notice } from "./issues"

interface GeneralConfig {
	server: string
	name: string
}

interface AudioConfig {
	sampleRate: number
	bitrate: number
	codec: string
	deviceId: string
}

const AUDIO_CONSTRAINTS = {
	sampleRate: [44100, 48000],
	bitrate: { min: 64_000, max: 256_000 },
	codec: AudioEncoderCodecs,
}

const AUDIO_DEFAULT = {
	sampleRate: 48000,
	bitrate: 128_000,
	codec: AudioEncoderCodecs[0],
	deviceId: "",
}

interface VideoConfig {
	height: number
	fps: number
	bitrate: number
	codec: string
	deviceId: string
}

interface VideoCodec {
	name: string
	profile: string
	value: string
}

const VIDEO_CODEC_UNDEF: VideoCodec = { name: "", profile: "", value: "" }

const VIDEO_CONSTRAINTS = {
	height: [240, 360, 480, 720, 1080],
	fps: [15, 30, 60],
	bitrate: { min: 500_000, max: 4_000_000 },
}

// We have to pay for bandwidth so we're cheap and default to 480p
const VIDEO_DEFAULT: VideoConfig = {
	height: 480,
	fps: 30,
	bitrate: 1_500_000,
	codec: "",
	deviceId: "",
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

export function Publish() {
	// Allow query parameters to ovveride some defaults.
	const [params] = useSearchParams<{ name?: string; server?: string }>()

	const [general, setGeneral] = createStore<GeneralConfig>({
		name: params.name ?? "",
		server: params.server ?? "",
	})
	const [audio, setAudio] = createStore<AudioConfig>(AUDIO_DEFAULT)
	const [video, setVideo] = createStore<VideoConfig>(VIDEO_DEFAULT)

	// Start loading the selected media device.
	const broadcast = createFetch(async () => {
		const width = Math.ceil((video.height * 16) / 9)

		const mediaPromise = window.navigator.mediaDevices.getUserMedia({
			audio: {
				sampleRate: { ideal: audio.sampleRate },
				channelCount: { max: 2, ideal: 2 },
				deviceId: audio.deviceId,
			},
			video: {
				aspectRatio: { ideal: 16 / 9 },
				width: { ideal: width, max: width },
				height: { ideal: video.height, max: video.height },
				frameRate: { ideal: video.fps, max: video.fps },
				deviceId: video.deviceId,
			},
		})

		const server = general.server || process.env.RELAY_HOST
		const name = general.name != "" ? general.name : crypto.randomUUID()

		const url = `https://${server}/${name}`

		// Special case localhost to fetch the TLS fingerprint from the server.
		// TODO remove this when WebTransport correctly supports self-signed certificates
		const fingerprint = server.startsWith("localhost") ? `https://${server}/fingerprint` : undefined

		const client = new Client({
			url,
			fingerprint,
			role: "publisher",
		})

		const connection = await client.connect()
		const media = await mediaPromise

		return new Broadcast({
			connection,
			media,
			name,
			audio: { codec: "opus", bitrate: 128_000 },
			video: { codec: video.codec, bitrate: video.bitrate },
		})
	})

	const broadcastClosed = createFetch((b) => b.closed(), broadcast)

	createEffect(() => {
		// Close the broadcast when the component is unmounted.
		onCleanup(() => broadcast()?.close())
	})

	// Fetch the list of devices.
	const devices = createFetch(() => window.navigator.mediaDevices.enumerateDevices(), true)

	const getDevices = (deviceType: MediaDeviceKind) => {
		return devices()?.filter((device: MediaDeviceInfo) => device.kind == deviceType) || []
	}

	const start = (e: Event) => {
		e.preventDefault()
		broadcast.fetch(true)
	}

	// Return a single error when something fails, in order of importance
	const error = createMemo(() => {
		return broadcast.error() ?? broadcastClosed()
	})

	// Report errors to terminal too so we'll get stack traces
	createEffect(() => {
		if (error()) console.error(error())
	})

	const [advanced, setAdvanced] = createSignal(false)
	const toggleAdvanced = (e: MouseEvent) => {
		e.preventDefault()
		setAdvanced(!advanced())
	}

	// Render the preview when the DOM is inserted
	let preview: HTMLVideoElement
	createEffect(() => broadcast()?.attach(preview))

	return (
		<>
			<Notice />
			<Show when={error()}>
				<div class="rounded-md bg-red-600 px-4 py-2 font-bold">
					{error()!.name}: {error()!.message}
				</div>
			</Show>
			<Show when={broadcast()}>
				<header>Preview</header>
				<Listing server={general.server} name={broadcast()!.config.name} catalog={broadcast()!.catalog} />
				<video ref={preview!} autoplay muted class="rounded-md" />
			</Show>
			<form class="grid grid-cols-3 items-center gap-3 text-sm">
				<General config={general} setConfig={setGeneral} advanced={advanced()} />
				<Video config={video} setConfig={setVideo} devices={getDevices("videoinput")} advanced={advanced()} />
				<Audio config={audio} setConfig={setAudio} devices={getDevices("audioinput")} advanced={advanced()} />

				<div class="col-span-3" />

				<button
					class="col-start-2 rounded-md bg-green-600 p-2 font-semibold shadow-sm hover:bg-green-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
					classList={{ "bg-red-600": !!error(), "hover:bg-red-500": !!error() }}
					type="submit"
					onClick={start}
				>
					<Switch fallback="Go Live">
						<Match when={error()}>Error</Match>
						<Match when={broadcast.loading()}>Connecting</Match>
						<Match when={broadcast()}>Live</Match>
					</Switch>
				</button>
				<a onClick={toggleAdvanced} class="p-2 text-center">
					<Show when={advanced()} fallback="Advanced">
						Simple
					</Show>
				</a>
			</form>
		</>
	)
}

function General(props: {
	config: Store<GeneralConfig>
	setConfig: SetStoreFunction<GeneralConfig>
	advanced: boolean
}) {
	// Only set the server config when focus is lost, so we don't spam reconnects.
	const [server, setServer] = createSignal("")

	return (
		<>
			<Show when={props.advanced}>
				<header class="col-span-3">General</header>

				<label for="server" class="col-start-1 p-2">
					Server
				</label>
				<input
					type="text"
					name="server"
					placeholder={process.env.RELAY_HOST}
					class="col-span-2 rounded-md border-0 bg-slate-700 text-sm shadow-sm focus:ring-1 focus:ring-inset focus:ring-green-600"
					value={server()}
					onInput={(e) => setServer(e.target.value)}
					onFocusOut={(e) => props.setConfig({ server: e.target.value })}
				/>

				<label for="name" class="col-start-1 p-2">
					Name
				</label>
				<input
					type="text"
					name="name"
					placeholder="random"
					class="col-span-2 rounded-md border-0 bg-slate-700 text-sm shadow-sm focus:ring-1 focus:ring-inset focus:ring-green-600"
					value={props.config.name}
					onInput={(e) => props.setConfig({ name: e.target.value })}
				/>
			</Show>
		</>
	)
}

function Video(props: {
	config: Store<VideoConfig>
	setConfig: SetStoreFunction<VideoConfig>
	advanced: boolean
	devices: MediaDeviceInfo[]
}) {
	const [codec, setCodec] = createStore<VideoCodec>(VIDEO_CODEC_UNDEF)

	// Fetch the list of supported codecs.
	const [supportedCodecs] = createResource(
		() => ({ height: props.config.height, fps: props.config.fps, bitrate: props.config.bitrate }),
		async (config) => {
			const isSupported = async (codec: VideoCodec) => {
				const supported = await VideoEncoder.isSupported({
					codec: codec.value,
					width: Math.ceil((config.height * 16) / 9),
					...config,
				})

				if (supported) return codec
			}

			// Call isSupported on each codec
			const promises = VIDEO_CODECS.map((codec) => isSupported(codec))

			// Wait for all of the promises to return
			const codecs = await Promise.all(promises)

			// Remove any undefined values, using this syntax so Typescript knows they aren't undefined
			return codecs.filter((codec): codec is VideoCodec => !!codec)
		},
		{ initialValue: [] },
	)

	// Default to the first valid codec if the settings are invalid.
	createEffect(() => {
		const supported = supportedCodecs()
		const valid = supported.find((supported) => {
			return supported.name == codec.name && supported.profile == codec.profile
		})

		// If we found a valid codec, make sure the valid is set
		if (valid) return setCodec(valid)

		// We didn't find a valid codec, so default to the first supported one.
		const defaultCodec = supported.at(0)
		if (defaultCodec) {
			setCodec(defaultCodec)
		} else {
			// Nothing supports this configuration, wipe the form
			setCodec(VIDEO_CODEC_UNDEF)
		}
	})

	// Return supported codec names in preference order.
	const supportedCodecNames = () => {
		const unique = new Set<string>()
		for (const codec of supportedCodecs()) {
			if (!unique.has(codec.name)) unique.add(codec.name)
		}
		return [...unique]
	}

	// Returns supported codec profiles in preference order.
	const supportedCodecProfiles = () => {
		const unique = new Set<string>()
		for (const supported of supportedCodecs()) {
			if (supported.name == codec.name && !unique.has(supported.profile)) unique.add(supported.profile)
		}
		return [...unique]
	}

	// Update the store with our computed value.
	createEffect(() => {
		props.setConfig({ codec: codec.value })
	})

	return (
		<>
			<header class="col-span-3">Video</header>

			<label class="col-start-1 p-2">Input</label>
			<select
				name="video-input"
				class="col-span-2 rounded-md border-0 bg-slate-700 text-sm shadow-sm focus:ring-1 focus:ring-inset focus:ring-green-600"
				onInput={(e) => props.setConfig({ deviceId: e.target.value })}
			>
				<For each={[...props.devices]}>
					{(device) => {
						return (
							<option value={device.deviceId} selected={props.config.deviceId === device.deviceId}>
								{device.label}
							</option>
						)
					}}
				</For>
			</select>

			<Show when={props.advanced}>
				<label for="codec" class="col-start-1 p-2">
					Codec
				</label>
				<select
					name="codec"
					class="flex-grow rounded-md border-0 bg-slate-700 text-sm shadow-sm focus:ring-1 focus:ring-inset focus:ring-green-600"
					onInput={(e) => setCodec({ name: e.target.value })}
				>
					<For each={[...supportedCodecNames()]}>
						{(supported) => {
							return (
								<option value={supported} selected={supported === codec.name}>
									{supported}
								</option>
							)
						}}
					</For>
				</select>
				<select
					name="profile"
					class="col-start-3 flex-grow rounded-md border-0 bg-slate-700 text-sm shadow-sm focus:ring-1 focus:ring-inset focus:ring-green-600"
					onInput={(e) => setCodec({ profile: e.target.value })}
				>
					<For each={[...supportedCodecProfiles()]}>
						{(supported) => {
							return (
								<option value={supported} selected={supported === codec.profile}>
									{supported}
								</option>
							)
						}}
					</For>
				</select>
			</Show>

			<label for="resolution" class="col-start-1 p-2">
				Resolution
			</label>
			<select
				name="resolution"
				class="rounded-md border-0 bg-slate-700 text-sm focus:ring-1 focus:ring-inset focus:ring-green-600"
				onInput={(e) => props.setConfig({ height: parseInt(e.target.value) })}
			>
				<For each={VIDEO_CONSTRAINTS.height}>
					{(res) => {
						return (
							<option value={res} selected={res === props.config.height}>
								{res}p
							</option>
						)
					}}
				</For>
			</select>

			<Show when={props.advanced}>
				<select
					name="fps"
					class="rounded-md border-0 bg-slate-700 text-sm shadow-sm focus:ring-1 focus:ring-inset focus:ring-green-600"
					onInput={(e) => props.setConfig({ fps: parseInt(e.target.value) })}
				>
					<For each={VIDEO_CONSTRAINTS.fps}>
						{(fps) => {
							return (
								<option value={fps} selected={fps === props.config.fps}>
									{fps}fps
								</option>
							)
						}}
					</For>
				</select>
			</Show>

			<label for="bitrate" class="col-start-1 p-2">
				Bitrate
			</label>
			<input
				type="range"
				name="bitrate"
				min={VIDEO_CONSTRAINTS.bitrate.min}
				max={VIDEO_CONSTRAINTS.bitrate.max}
				step="100000"
				value={props.config.bitrate}
				onInput={(e) => props.setConfig({ bitrate: parseInt(e.target.value) })}
			/>
			<div>{(props.config.bitrate / 1_000_000).toFixed(1)} Mb/s</div>
		</>
	)
}

function Audio(props: {
	config: Store<AudioConfig>
	setConfig: SetStoreFunction<AudioConfig>
	advanced: boolean
	devices: MediaDeviceInfo[]
}) {
	return (
		<>
			<header class="col-span-3">Audio</header>

			<label class="col-start-1 p-2">Input</label>
			<select
				name="audio-input"
				class="col-span-2 rounded-md border-0 bg-slate-700 text-sm shadow-sm focus:ring-1 focus:ring-inset focus:ring-green-500"
				onInput={(e) => props.setConfig({ deviceId: e.target.value })}
			>
				<For each={props.devices}>
					{(device) => {
						return (
							<option value={device.deviceId} selected={props.config.deviceId === device.deviceId}>
								{device.label}
							</option>
						)
					}}
				</For>
			</select>

			<Show when={props.advanced}>
				<label for="codec" class="col-start-1 p-2">
					Codec
				</label>
				<select
					name="codec"
					class="rounded-md border-0 bg-slate-700 text-sm shadow-sm focus:ring-1 focus:ring-inset focus:ring-green-600"
					onInput={(e) => props.setConfig({ codec: e.target.value })}
				>
					<For each={AUDIO_CONSTRAINTS.codec}>
						{(supported) => {
							return (
								<option value={supported} selected={supported === props.config.codec}>
									{supported}
								</option>
							)
						}}
					</For>
				</select>

				<select
					name="sampleRate"
					class="rounded-md border-0 bg-slate-700 text-sm shadow-sm focus:ring-1 focus:ring-inset focus:ring-green-600"
					onInput={(e) => props.setConfig({ sampleRate: parseInt(e.target.value) })}
				>
					<For each={AUDIO_CONSTRAINTS.sampleRate}>
						{(supported) => {
							return (
								<option value={supported} selected={supported === props.config.sampleRate}>
									{supported}hz
								</option>
							)
						}}
					</For>
				</select>

				<label for="bitrate" class="col-start-1 p-2">
					Bitrate
				</label>
				<input
					type="range"
					name="bitrate"
					min={AUDIO_CONSTRAINTS.bitrate.min}
					max={AUDIO_CONSTRAINTS.bitrate.max}
					step="1000"
					value={props.config.bitrate}
					onInput={(e) => props.setConfig({ bitrate: parseInt(e.target.value) })}
				/>
				<div>{Math.floor(props.config.bitrate / 1000)} Kb/s</div>
			</Show>
		</>
	)
}

// We take the client used to create the broadcast so we can create a sharable link
export function Preview() {}
