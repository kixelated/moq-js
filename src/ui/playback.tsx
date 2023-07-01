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
			setTimeline(timeline)
		}
	})

	const playing = createMemo(() => {
		return timeline() && timeline()?.timestamp !== undefined
	})

	return (
		<div
			class="flex flex-col overflow-hidden transition-all duration-1000"
			classList={{ "h-[500]": playing(), "h-0": !playing() }}
		>
			<canvas ref={canvas!} width="854" height="480" class="aspect-video bg-black"></canvas>
			<Buffer timeline={timeline()} />
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

function Buffer(props: { timeline: Timeline }) {
	const playhead = createMemo(() => {
		return props.timeline.timestamp ?? 0
	})

	const maxEnd = (ranges: Range[]) => {
		return ranges.reduce((max, range) => Math.max(max, range.end), 0)
	}

	const bounds = createMemo(() => {
		const start = Math.max(playhead() - 2, 0)
		const end =
			Math.max(
				maxEnd(props.timeline.audio.buffer) + 1,
				maxEnd(props.timeline.video.buffer) + 1,
				playhead() + 3,
				start + 4
			) + 1
		return { start, end }
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
		<div class="relative flex h-6 flex-col transition-all duration-100" onClick={click}>
			<Component bounds={bounds()} ranges={props.timeline.audio.buffer} />
			<Component bounds={bounds()} ranges={props.timeline.video.buffer} />
			<Legend bounds={bounds()} playhead={playhead()} />
			<Playhead bounds={bounds()} playhead={playhead()} />
		</div>
	)
}

function Component(props: { bounds: Range; ranges: Range[] }) {
	return (
		<div class="relative basis-1/2">
			<For each={props.ranges}>
				{(range) => {
					return (
						<div
							class="absolute bottom-0 top-0 bg-indigo-500 transition-all"
							style={{
								left: `${asPercent(range.start, props.bounds)}%`,
								width: `${asPercent(range.end, props.bounds) - asPercent(range.start, props.bounds)}%`,
							}}
						></div>
					)
				}}
			</For>
		</div>
	)
}

function Playhead(props: { bounds: Range; playhead: number }) {
	return (
		<div
			class="absolute bottom-0 top-0 w-1 bg-indigo-50/50 transition-[left]"
			style={{
				left: `${asPercent(props.playhead, props.bounds)}%`,
			}}
		></div>
	)
}

function Legend(props: { bounds: Range; playhead: number }) {
	const breakpoints = createMemo(() => {
		const start = Math.floor(props.bounds.start)
		const end = Math.ceil(props.bounds.end)

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
					<div
						class="absolute bottom-0 top-0 text-sm text-white transition-[left]"
						style={{ left: `${asPercent(breakpoint, props.bounds)}%` }}
					>
						{breakpoint}
					</div>
				)
			}}
		</For>
	)
}

// Converts a value from to a 0-100 range based on the bounds.
function asPercent(value: number, bounds: Range) {
	return (100 * (value - bounds.start)) / (bounds.end - bounds.start)
}
