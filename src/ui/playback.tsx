import { Player, Range, Broadcast } from "../playback"
import * as MP4 from "../shared/mp4"

import { createSignal, createMemo, onMount, For, Show, createEffect } from "solid-js"

export function Main(props: { player: Player }) {
	let canvas: HTMLCanvasElement

	onMount(() => {
		props.player.render(canvas)
	})

	return (
		<>
			<canvas ref={canvas!} width="854" height="480" class="aspect-video bg-black"></canvas>
			<Timeline player={props.player} />
		</>
	)
}

export function Setup(props: { start: () => void; player: Player }) {
	const [broadcasts, setBroadcasts] = createSignal<Broadcast[]>([])

	createEffect(async () => {
		for await (const broadcast of props.player.broadcasts()) {
			setBroadcasts((prev) => prev.concat(broadcast))
		}
	})

	return (
		<>
			<p class="mb-6 text-center font-mono text-xl">Watch</p>
			<ul>
				<For each={broadcasts()} fallback={"No live broadcasts"}>
					{(broadcast) => {
						return (
							<li class="mt-4">
								<SetupBroadcast start={props.start} broadcast={broadcast} />
							</li>
						)
					}}
				</For>
			</ul>
		</>
	)
}

function SetupBroadcast(props: { start: () => void; broadcast: Broadcast }) {
	const watch = (e: MouseEvent) => {
		e.preventDefault()
		props.broadcast.subscribeAuto()
		props.start()
	}

	const stylizeName = (name: string) => {
		return name.replace(/\//, " / ")
	}

	return (
		<>
			<a onClick={watch}>{stylizeName(props.broadcast.name)}</a>
			<div class="ml-4 text-xs italic text-gray-700">
				<For each={props.broadcast.tracks}>
					{(track) => {
						return <div>{trackInfo(track.info)}</div>
					}}
				</For>
			</div>
		</>
	)
}

// A function because Match doesn't work with Typescript type guards
function trackInfo(track: MP4.Track) {
	if (MP4.isVideoTrack(track)) {
		return (
			<>
				video: {track.codec} {track.video.width}x{track.video.height}
				<Show when={track.bitrate}> {track.bitrate} b/s</Show>
			</>
		)
	} else if (MP4.isAudioTrack(track)) {
		return (
			<>
				audio: {track.codec} {track.audio.sample_rate}Hz {track.audio.channel_count}.0
				<Show when={track.bitrate}> {track.bitrate} b/s</Show>
				<Show when={track.language !== "und"}> {track.language}</Show>
			</>
		)
	} else {
		return "unknown track type"
	}
}

function Timeline(props: { player: Player }) {
	let svg: SVGSVGElement

	const [width, setWidth] = createSignal(0)
	onMount(() => {
		setWidth(svg.getBBox().width)
	})

	const [playhead, setPlayhead] = createSignal(0)
	//setInterval(() => setPlayhead((x) => x + 0.01), 10)

	const [audio, setAudio] = createSignal([
		{ start: 0, end: 0.5 },
		{ start: 1.0, end: 2.0 },
	])

	const [video, setVideo] = createSignal([
		{ start: 0, end: 0.7 },
		{ start: 1.0, end: 2.1 },
	])

	const bounds = createMemo(() => {
		return { start: playhead() - width() / 2, end: playhead() + width() / 2 }
	})

	const click = (e: MouseEvent) => {
		e.preventDefault()

		const rect = (e.target as HTMLElement).getBoundingClientRect()
		const pos = (e.clientX - rect.left) / rect.width // 0 - 1

		// 50% = playhead()

		// TODO can we make this accurate?
		const timestamp = playhead() - rect.width / 100 + e.clientX
		props.player.seek(timestamp)
	}

	return (
		<div class="relative">
			<svg
				ref={svg!}
				class="h-6 w-full"
				viewBox={`${bounds().start} 0 ${bounds().end - bounds().start} 0.24`}
				preserveAspectRatio="xMidYMid meet"
				onClick={click}
			>
				<Component y={0} height={0.12} ranges={audio()} />
				<Component y={0.12} height={0.12} ranges={video()} />
				<Legend playhead={playhead()} />
				<Playhead playhead={playhead()} />
			</svg>
		</div>
	)
}

function Component(props: { y: number; height: number; ranges: Range[] }) {
	return (
		<For each={props.ranges}>
			{(range) => {
				return (
					<rect
						x={range.start}
						width={range.end - range.start}
						y={props.y}
						height={props.height}
						class="fill-indigo-500"
					></rect>
				)
			}}
		</For>
	)
}

function Playhead(props: { playhead: number }) {
	return (
		<line
			x1={props.playhead}
			x2={props.playhead}
			y1="0.02"
			y2="0.22"
			stroke-width="0.01"
			class="stroke-indigo-50/50"
		></line>
	)
}

function Legend(props: { playhead: number }) {
	const breakpoints = createMemo(() => {
		const start = Math.floor(props.playhead - 10)
		const end = Math.ceil(props.playhead + 10)

		const breakpoints = []
		for (let i = start; i <= end; i++) {
			breakpoints.push(i)
		}

		return breakpoints
	})

	return (
		<For each={breakpoints()}>
			{(breakpoint) => {
				return (
					<text
						x={breakpoint}
						y="0.16"
						font-size="0.14"
						class="fill-white"
						style={{ "text-anchor": "middle" }}
					>
						{breakpoint}
					</text>
				)
			}}
		</For>
	)
}
