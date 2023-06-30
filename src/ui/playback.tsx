import { Player, Range, Broadcast, Timeline } from "../playback"
import * as MP4 from "../shared/mp4"

import { createSignal, createMemo, onMount, For, Show, createEffect } from "solid-js"

export function Main(props: { player: Player }) {
	let canvas: HTMLCanvasElement

	onMount(() => {
		props.player.render(canvas)
		return props.player.close
	})

	const [timeline, setTimeline] = createSignal<Timeline>({ audio: { buffer: [] }, video: { buffer: [] } })

	createEffect(async () => {
		for await (const timeline of props.player.timeline()) {
			console.log(timeline)
			setTimeline(timeline)
		}
	})

	const playing = createMemo(() => {
		return timeline() && timeline()?.timestamp !== undefined
	})

	return (
		<div class="flex flex-col transition-all duration-1000" classList={{ "h-[500]": playing(), "h-0": !playing() }}>
			<canvas ref={canvas!} width="854" height="480" class="aspect-video bg-black"></canvas>
			<Buffer width={854} height={20} timeline={timeline()} />
		</div>
	)
}

export function Setup(props: { player: Player }) {
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
								<SetupBroadcast player={props.player} broadcast={broadcast} />
							</li>
						)
					}}
				</For>
			</ul>
		</>
	)
}

function SetupBroadcast(props: { player: Player; broadcast: Broadcast }) {
	const watch = (e: MouseEvent) => {
		e.preventDefault()
		props.broadcast.subscribeAuto()
		props.player.play()
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

function Buffer(props: { timeline: Timeline; width: number; height: number }) {
	let svg: SVGSVGElement

	const playhead = createMemo(() => {
		return props.timeline.timestamp ?? 0
	})

	//setInterval(() => setPlayhead((x) => x + 0.01), 10)

	const bounds = createMemo(() => {
		const width = props.width / 100
		return { start: playhead() - width / 2, end: playhead() + width / 2 }
	})

	const click = (e: MouseEvent) => {
		e.preventDefault()

		const rect = (e.target as HTMLElement).getBoundingClientRect()
		const pos = (e.clientX - rect.left) / rect.width // 0 - 1

		// 50% = playhead()

		// TODO can we make this accurate?
		const timestamp = playhead() - rect.width / 100 + e.clientX
		//props.player.seek(timestamp)
	}

	return (
		<svg
			ref={svg!}
			width={props.width}
			height={props.height}
			viewBox={`${bounds().start} 0 ${bounds().end - bounds().start} 0.24`}
			preserveAspectRatio="xMidYMid meet"
			onClick={click}
		>
			<Component y={0} height={0.12} ranges={props.timeline.audio.buffer} />
			<Component y={0.12} height={0.12} ranges={props.timeline.video.buffer} />
			<Legend playhead={playhead()} />
			<Playhead playhead={playhead()} />
		</svg>
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
