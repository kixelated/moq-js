import { Broadcast } from "../contribute/broadcast"
import { Encoder } from "../contribute/encoder"
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
} from "solid-js"
import { createStore } from "solid-js/store"

const CONSTRAINTS = {
	height: [480, 720, 1080, 1440],
	fps: [15, 30, 60],
	bitrate: { min: 500_000, max: 4_000_000 },
}

// A list of codecs and profiles sorted in preferred order.
// TODO automate this list by looping over profile/level pairs
const CODECS: Codec[] = [
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

const CODEC_UNDEF = { name: "", profile: "", value: "" }

interface Codec {
	name: string
	profile: string
	value: string
}

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

	return <video ref={preview!} autoplay muted></video>
}

export function Setup(props: {
	connection: Connection | undefined
	setBroadcast(v: Broadcast | undefined): void
	setError(e: Error): void
}) {
	const [name, setName] = createSignal("")
	const [codec, setCodec] = createStore<Codec>({ name: "", profile: "", value: "" })

	// These limit which codec we can use.
	const [constraints, setConstraints] = createStore({
		height: 720,
		get width() {
			return Math.ceil((this.height * 16) / 9)
		},
		fps: 30,
		bitrate: 2_000_000,
	})

	// Fetch the list of supported codecs.
	const [supportedCodecs] = createResource(
		() => ({ ...constraints }), // weird syntax is required so it reruns on update
		async (constraints) => {
			const config = {
				width: constraints.width,
				height: constraints.height,
				framerate: constraints.fps,
				bitrate: constraints.bitrate,
			}

			const isSupported = async (codec: Codec) => {
				const supported = await Encoder.isSupported({
					codec: codec.value,
					...config,
				})

				if (supported) return codec
			}

			// Call isSupported on each codec
			const promises = CODECS.map((codec) => isSupported(codec))

			// Wait for all of the promises to return
			const codecs = await Promise.all(promises)

			// Remove any undefined values, using this syntax so Typescript knows they aren't undefined
			return codecs.filter((codec): codec is Codec => !!codec)
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
			setCodec(CODEC_UNDEF)
		}
	})

	const ShowName = () => {
		return <div>My name: {name()}</div>
	}

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

	const [loading, setLoading] = createSignal(false)

	const [broadcast] = createResource(loading, async () => {
		const media = await window.navigator.mediaDevices.getUserMedia({
			audio: false, // TODO
			video: {
				aspectRatio: { ideal: 16 / 9 },
				width: { ideal: constraints.width, max: constraints.width },
				height: { ideal: constraints.height, max: constraints.height },
				frameRate: { ideal: constraints.fps, max: constraints.fps },
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
			encoder: { codec: codec.value, bitrate: constraints.bitrate },
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

	return (
		<form class="grid grid-cols-3 items-center gap-x-4 gap-y-2 text-sm text-gray-900">
			<NameInput name={name()} setName={setName} />
			<label for="codec" class="col-start-1 font-medium leading-6">
				Codec
			</label>
			<select
				name="codec"
				class="col-span-1 rounded-md border-0 text-sm shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600"
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
				class="col-span-1 rounded-md border-0 text-sm shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600"
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
			<label for="resolution" class="col-start-1 font-medium leading-6">
				Resolution
			</label>
			<select
				name="resolution"
				class="col-span-2 rounded-md border-0 text-sm shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600"
				onInput={(e) => setConstraints({ height: parseInt(e.target.value) })}
			>
				<For each={CONSTRAINTS.height}>
					{(res) => {
						return (
							<option value={res} selected={res === constraints.height}>
								{res}p
							</option>
						)
					}}
				</For>
			</select>
			<label for="fps" class="col-start-1 font-medium">
				FPS
			</label>
			<select
				name="fps"
				class="col-span-2 rounded-md border-0 text-sm shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600"
				onInput={(e) => setConstraints({ fps: parseInt(e.target.value) })}
			>
				<For each={CONSTRAINTS.fps}>
					{(fps) => {
						return (
							<option value={fps} selected={fps === constraints.fps}>
								{fps}
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
				min={CONSTRAINTS.bitrate.min}
				max={CONSTRAINTS.bitrate.max}
				step="1000"
				value={constraints.bitrate}
				onInput={(e) => setConstraints({ bitrate: parseInt(e.target.value) })}
			/>
			<span class="text-left text-xs">{Math.floor(constraints.bitrate / 1000)} Kb/s</span>
			<button
				class="transition-color col-span-2 col-start-2 mt-3 rounded-md px-3 py-2 text-sm font-semibold text-white shadow-sm duration-1000 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
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
		</form>
	)
}

function NameInput(props: { name: string; setName(name: string): void }) {
	return (
		<>
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
