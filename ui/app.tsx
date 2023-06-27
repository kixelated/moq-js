/*
import { Player } from "~/main"
import { Connection } from "~/transport"
import { Timeline } from "./timeline"
*/

import { createSignal, For, Switch, Match } from "solid-js"

export function App() {
	return (
		<div class="relative overflow-hidden rounded-lg shadow-xl ring-1 ring-gray-900/5">
			<div class="relative flex flex-col bg-black">
				<Timeline />
			</div>
			<Canvas />
			<div class="absolute top-0 w-full p-10">
				<Settings />
			</div>
			<div class="absolute right-0 top-0 p-3 transition-all hover:rotate-45 hover:cursor-pointer">
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-6 w-6 fill-white/90">
					<path d="M24 13.616v-3.232c-1.651-.587-2.694-.752-3.219-2.019v-.001c-.527-1.271.1-2.134.847-3.707l-2.285-2.285c-1.561.742-2.433 1.375-3.707.847h-.001c-1.269-.526-1.435-1.576-2.019-3.219h-3.232c-.582 1.635-.749 2.692-2.019 3.219h-.001c-1.271.528-2.132-.098-3.707-.847l-2.285 2.285c.745 1.568 1.375 2.434.847 3.707-.527 1.271-1.584 1.438-3.219 2.02v3.232c1.632.58 2.692.749 3.219 2.019.53 1.282-.114 2.166-.847 3.707l2.285 2.286c1.562-.743 2.434-1.375 3.707-.847h.001c1.27.526 1.436 1.579 2.019 3.219h3.232c.582-1.636.75-2.69 2.027-3.222h.001c1.262-.524 2.12.101 3.698.851l2.285-2.286c-.744-1.563-1.375-2.433-.848-3.706.527-1.271 1.588-1.44 3.221-2.021zm-12 2.384c-2.209 0-4-1.791-4-4s1.791-4 4-4 4 1.791 4 4-1.791 4-4 4z" />
				</svg>
			</div>
		</div>
	)
}

export function Canvas() {
	return <canvas width="854" height="480" class="aspect-video bg-black"></canvas>
}

export function Timeline() {
	return (
		<>
			<div class="audio h-2"></div>
			<div class="video h-2"></div>
			<div class="playhead absolute"></div>
			<div class="legend absolute"></div>
		</>
	)
}

export function Settings() {
	return (
		<div class="flex flex-row rounded-md bg-white/90 shadow-xl ring-1 ring-gray-900/5 backdrop-blur-md">
			<div class="w-60 basis-1/2 p-6">
				<Watch />
			</div>
			<div class="basis-0 border-l-2 border-dotted border-black/20"></div>
			<div class="w-60 basis-1/2 p-6">
				<Broadcast />
			</div>
		</div>
	)
}

export function Watch() {
	const initialBroadcasts = [
		{
			name: "quic.video/BigBuckBunny.mp4",
			tracks: [
				{ type: "video", codec: "h.264", resolution: "720p", fps: 30 },
				{ type: "audio", codec: "aac", sampleRate: 44100 },
			],
		},
		{
			name: "anon.quic.video/126sdg124as",
			tracks: [
				{ type: "video", codec: "h.264", resolution: "720p", fps: 30 },
				{ type: "audio", codec: "aac", sampleRate: 44100 },
			],
		},
	]

	const [broadcasts, _setBroadcasts] = createSignal(initialBroadcasts)

	return (
		<>
			<p class="mb-6 text-center font-mono text-xl">Watch</p>
			<ul>
				<For each={broadcasts()}>
					{(broadcast) => {
						return (
							<li class="mb-4">
								<a>{broadcast.name}</a>
								<ul class="ml-4 text-xs text-gray-700">
									<For each={broadcast.tracks}>
										{(track) => {
											return (
												<li>
													<span>{track.type}:</span>
													<Switch fallback={<span class="italic">unknown</span>}>
														<Match when={track.type === "video"}>
															<span class="italic">
																{track.codec} {track.resolution}@{track.fps}fps
															</span>
														</Match>
														<Match when={track.type === "audio"}>
															<span class="italic">
																{track.codec} {track.sampleRate}Hz
															</span>
														</Match>
													</Switch>
												</li>
											)
										}}
									</For>
								</ul>
							</li>
						)
					}}
				</For>
			</ul>
		</>
	)
}

export function Broadcast() {
	// Multiple signals for MARGINAL GAINS
	const [getName, setName] = createSignal("")
	const [getCodec, setCodec] = createSignal("h.264")
	const [getRes, setRes] = createSignal("720p")
	const [getFps, setFps] = createSignal(30)
	const [getBitrate, setBitrate] = createSignal(2000)

	const availCodec = ["h.264"]
	const availRes = ["480p", "720p", "1080p", "1440p"]
	const availFps = [15, 30, 60]
	const maxBitrate = 4000
	const minBitrate = 500

	return (
		<>
			<p class="mb-6 text-center font-mono text-xl">Broadcast</p>

			<form class="grid grid-cols-3 items-center gap-2 text-sm text-gray-900">
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
						value={getName()}
						onInput={(e) => setName(e.target.value)}
					/>
				</div>
				<label for="codec" class="col-start-1 font-medium leading-6">
					Codec
				</label>
				<select
					name="codec"
					class="col-span-2 rounded-md border-0 text-sm shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600"
					onInput={(e) => setCodec(e.target.value)}
				>
					<For each={availCodec}>
						{(codec) => {
							return (
								<option value={codec} selected={codec === getCodec()}>
									{codec}
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
					onInput={(e) => setRes(e.target.value)}
				>
					<For each={availRes}>
						{(res) => {
							return (
								<option value="{res}" selected={res === getRes()}>
									{res}
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
					onInput={(e) => setFps(parseInt(e.target.value))}
				>
					<For each={availFps}>
						{(fps) => {
							return (
								<option value="{fps}" selected={fps === getFps()}>
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
					min={minBitrate}
					max={maxBitrate}
					step="100"
					value={getBitrate()}
					onInput={(e) => setBitrate(parseInt(e.target.value))}
				/>
				<span class="text-left text-xs">{getBitrate()} Kb/s</span>
				<button
					class="col-span-1 col-start-3 mt-3 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
					type="submit"
				>
					Go Live
				</button>
			</form>
		</>
	)
}

/*
			<div class="absolute top-0 w-full p-10">
				<div class="flex flex-row rounded-md bg-white/90 shadow-xl ring-1 ring-gray-900/5 backdrop-blur-md">
					<div class="w-60 basis-1/2 p-6">
						<p class="mb-6 text-center font-mono text-xl">Watch</p>
						<ul class="">
							<li class="mb-4">
								<a>quic.video / BigBuckBunny.mp4</a>
								<ul class="ml-4 text-xs text-gray-700">
									<li>
										<span>video:</span>
										<span class="italic">h.264 720p@30fps</span>
									</li>
									<li>
										<span>audio:</span>
										<span class="italic">aac 44.1Khz</span>
									</li>
								</ul>
							</li>
							<li class="mb-4">
								<a>anon.quic.video / 126sdg124as</a>
								<ul class="ml-4 text-xs text-gray-700">
									<li>
										<span>video:</span>
										<span class="italic">h.264 720p@30fps</span>
									</li>
									<li>
										<span>audio:</span>
										<span class="italic">aac 44.1Khz</span>
									</li>
								</ul>
							</li>
						</ul>
					</div>
					<div class="basis-0 border-l-2 border-dotted border-black/20"></div>
					<div class="basis-1/2 p-6">
				</div>
			</div>
			*/

/*
export function App({ url }: { url: string }) {
	const canvasRef = React.useRef()

	// const timeline = new Timeline(player, timeline)

	useEffect(() => {
		const transport = new Connection({
			url,
			role: "subscriber",
			fingerprint: url + "/fingerprint",
		})

		const canvas = canvasRef.current
		const offscreen = canvasRef.current.transferControlToOffscreen()
		const player = new Player(transport, offscreen)
	}, [url])

	return <canvas ref={canvasRef} />
}

type AppState = {
	count: number // like this
}

export class App extends React.Component<AppProps, AppState> {
	#transport: Connection
	#player: Player
	#timeline: Timeline

	// DOM elements
	#canvas: HTMLCanvasElement
	#play: HTMLElement

	constructor(props: AppProps) {
		super(props)

		const params = new URLSearchParams(window.location.search)
		const url = params.get("url") || "https://localhost:4443"

		this.#transport = new Connection({
			url,
			role: "subscriber",
			fingerprint: url + "/fingerprint",
		})

		this.#player = new Player(this.#transport, canvas.transferControlToOffscreen())
		this.#timeline = new Timeline(this.#player, timeline)

		this.#play.addEventListener("click", this.#onPlay.bind(this))
	}

	render() {
		return (
			<div>
				{this.props.message} {this.state.count}
			</div>
		)
	}
}
*/
