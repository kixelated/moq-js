import { Broadcast } from "../contribute/broadcast"
import { Encoder } from "../contribute/video"
import { Connection } from "../transport/connection"
import { asError } from "../common/error"

import {
	createEffect,
	Switch,
	Match,
	createMemo,
	createSignal,
	For,
	createResource,
	onMount,
	createSelector,
	Show,
} from "solid-js"

import { SetStoreFunction, Store, createStore } from "solid-js/store"

import { EncoderCodecs as AudioCodecs } from "../contribute/audio"

interface AudioConfig {
	sampleRate: number
	bitrate: number
	codec: string
}

const AUDIO_CONSTRAINTS = {
	sampleRate: [44100],
	bitrate: { min: 64_000, max: 256_000 },
	codec: AudioCodecs,
}

const AUDIO_DEFAULT = {
	sampleRate: 44100,
	bitrate: 128_000,
	codec: AudioCodecs[0],
}

interface VideoConfig {
	height: number
	fps: number
	bitrate: number
	codec: string
}

interface VideoCodec {
	name: string
	profile: string
	value: string
}

const VIDEO_CODEC_UNDEF: VideoCodec = { name: "", profile: "", value: "" }

const VIDEO_CONSTRAINTS = {
	height: [480, 720, 1080, 1440],
	fps: [15, 30, 60],
	bitrate: { min: 500_000, max: 4_000_000 },
}

const VIDEO_DEFAULT: VideoConfig = {
	height: 720,
	fps: 30,
	bitrate: 2_000_000,
	codec: "",
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

export function Main(props: { broadcast: Broadcast; setBroadcast(): void; setError(e: Error): void }) {
	let preview: HTMLVideoElement

	onMount(() => {
		props.broadcast.preview(preview)
	})

	createEffect(async () => {
		try {
			await props.broadcast.run()
		} catch (e) {
			props.setError(asError(e))
		} finally {
			props.setBroadcast()
		}
	})

	return <video ref={preview!} class="aspect-video" autoplay muted></video>
}

export function Setup(props: {
	connection: Connection | undefined
	setBroadcast(v: Broadcast | undefined): void
	setError(e: Error): void
}) {
	const [name, setName] = createSignal("")
	const [audio, setAudio] = createStore<AudioConfig>(AUDIO_DEFAULT)
	const [video, setVideo] = createStore<VideoConfig>(VIDEO_DEFAULT)

	const [loading, setLoading] = createSignal(false)

	const [broadcast] = createResource(loading, async () => {
		const media = await window.navigator.mediaDevices.getUserMedia({
			audio: {
				sampleRate: { ideal: audio.sampleRate },
				channelCount: { ideal: 2 },
			},
			video: {
				aspectRatio: { ideal: 16 / 9, max: 16 / 9 },
				height: { ideal: video.height, max: video.height },
				frameRate: { ideal: video.fps, max: video.fps },
			},
		})

		const conn = props.connection
		if (!conn) throw new Error("disconnected")

		let full = name() != "" ? name() : crypto.randomUUID()
		full = `anon.quic.video/${full}`

		return new Broadcast({
			conn,
			media,
			name: full,
			audio: { codec: "opus", bitrate: 128_000 },
			video: { codec: video.codec, bitrate: video.bitrate },
		})
	})

	createEffect(() => {
		try {
			const b = broadcast()
			props.setBroadcast(b)
		} catch (e) {
			props.setError(asError(e))
		} finally {
			setLoading(false)
		}
	})

	const start = (e: Event) => {
		e.preventDefault()
		setLoading(true)
	}

	const state = createMemo(() => {
		if (!props.connection) return "connecting"
		if (broadcast.loading) return "loading"
		return "ready"
	})

	const isState = createSelector(state)

	const [advanced, setAdvanced] = createSignal(false)
	const toggleAdvanced = (e: MouseEvent) => {
		e.preventDefault()
		setAdvanced(!advanced())
	}

	return (
		<form class="grid grid-cols-3 items-center justify-center gap-x-4 gap-y-2 text-sm text-gray-900">
			<div classList={{ hidden: !advanced() }}>
				<Name name={name()} setName={setName} />
				<Video config={video} setConfig={setVideo} />
				<Audio config={audio} setConfig={setAudio} />
			</div>

			<button
				class="transition-color col-start-2 mt-3 rounded-md px-3 py-2 text-sm font-semibold text-white shadow-sm duration-1000 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
				classList={{
					"bg-indigo-600": isState("ready") || isState("connecting"),
					"hover:bg-indigo-500": isState("ready"),
					"focus-visible:outline-indigo-600": isState("ready"),
					"bg-cyan-600": isState("loading"),
				}}
				type="submit"
				onClick={start}
			>
				<Switch>
					<Match when={isState("ready")}>Go Live</Match>
					<Match when={isState("loading")}>Loading</Match>
					<Match when={isState("connecting")}>Connecting</Match>
				</Switch>
			</button>

			<a href="#" onClick={toggleAdvanced} class="text-center">
				<Show when={advanced()} fallback="Advanced">
					Simple
				</Show>
			</a>
		</form>
	)
}

function Name(props: { name: string; setName(name: string): void }) {
	return (
		<>
			<div class="col-span-3 mt-3 border-b-2 border-gray-700/10 pl-3 text-lg">Settings</div>
			<label for="name" class="col-start-1 block font-medium">
				Name
			</label>
			<div class="form-input col-span-2 w-full rounded-md border-0 text-sm shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600">
				<span>anon.quic.video/</span>
				<input
					type="text"
					name="name"
					placeholder="random"
					class="block border-0 bg-transparent p-1 pl-3 text-sm text-gray-900 placeholder:text-gray-400 focus:ring-0"
					value={props.name}
					onInput={(e) => props.setName(e.target.value)}
				/>
			</div>
		</>
	)
}

function Video(props: { config: Store<VideoConfig>; setConfig: SetStoreFunction<VideoConfig> }) {
	const [codec, setCodec] = createStore<VideoCodec>(VIDEO_CODEC_UNDEF)

	// Fetch the list of supported codecs.
	const [supportedCodecs] = createResource(
		() => ({ height: props.config.height, fps: props.config.fps, bitrate: props.config.bitrate }),
		async (config) => {
			const isSupported = async (codec: VideoCodec) => {
				const supported = await Encoder.isSupported({
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
		{ initialValue: [] }
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
		console.log("codec", codec.value)
		props.setConfig({ codec: codec.value })
	})

	return (
		<>
			<div class="col-span-3 mt-3 border-b-2 border-gray-700/10 pl-3 text-lg ">Video</div>
			<label class="col-start-1 font-medium leading-6">Codec</label>
			<select
				name="codec"
				class="rounded-md border-0 text-sm shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600"
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
				class="col-start-3 rounded-md border-0 text-sm shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600"
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
			<label class="col-start-1 font-medium leading-6">Resolution</label>
			<select
				name="resolution"
				class="rounded-md border-0 text-sm shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600"
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
			<select
				name="fps"
				class="rounded-md border-0 text-sm shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600"
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
			<label class="col-start-1 font-medium leading-6">Bitrate</label>
			<input
				type="range"
				name="bitrate"
				min={VIDEO_CONSTRAINTS.bitrate.min}
				max={VIDEO_CONSTRAINTS.bitrate.max}
				step="1000"
				value={props.config.bitrate}
				onInput={(e) => props.setConfig({ bitrate: parseInt(e.target.value) })}
			/>
			<span class="text-xs leading-6">{Math.floor(props.config.bitrate / 1000)} Kb/s</span>
		</>
	)
}

function Audio(props: { config: Store<AudioConfig>; setConfig: SetStoreFunction<AudioConfig> }) {
	return (
		<>
			<div class="col-span-3 mt-3 border-b-2 border-gray-700/10 pl-3 text-lg">Audio</div>
			<label for="codec" class="col-start-1 font-medium leading-6">
				Codec
			</label>
			<select
				name="codec"
				class="rounded-md border-0 text-sm shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600"
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
				class="rounded-md border-0 text-sm shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600"
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
			<label for="bitrate" class="col-start-1 font-medium">
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
			<span class="text-left text-xs">{Math.floor(props.config.bitrate / 1000)} Kb/s</span>
		</>
	)
}
