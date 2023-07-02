import { Player, Range, Broadcast, Timeline } from "../playback"
import * as MP4 from "../shared/mp4"

import { createSignal, createMemo, onMount, For, Show, createEffect } from "solid-js"

export function Main(props: { active: boolean; player: Player }) {
	let canvas: HTMLCanvasElement

	onMount(() => {
		props.player.render(canvas)
		return props.player.close
	})

	createEffect(() => {
		if (props.active) {
			props.player.play()
		} else {
			// TODO props.player.pause()
		}
	})

	return (
		<div
			class="flex flex-col overflow-hidden transition-size duration-1000"
			classList={{ "h-[500]": props.active, "h-0": !props.active }}
		>
			<canvas ref={canvas!} width="854" height="480" class="aspect-video bg-black"></canvas>
			<Buffer player={props.player} />
		</div>
	)
}

export function Setup(props: { start: () => void; player: Player }) {
	const [broadcasts, setBroadcasts] = createSignal<Broadcast[]>([])

	createEffect(async () => {
		for await (const broadcast of props.player.broadcasts()) {
			setBroadcasts((prev) => prev.concat(broadcast))
		}
	})

	// A function because Match doesn't work with Typescript type guards
	const trackInfo = (track: MP4.Track) => {
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

	const stylizeName = (name: string) => {
		return name.replace(/\//, " / ")
	}

	const watch = (broadcast: Broadcast, e: MouseEvent) => {
		e.preventDefault()
		broadcast.subscribeAuto()
		props.start()
	}

	return (
		<>
			<p class="mb-6 text-center font-mono text-xl">Watch</p>
			<ul>
				<For each={broadcasts()} fallback={"No live broadcasts"}>
					{(broadcast) => {
						return (
							<li class="mt-4">
								<a onClick={watch.bind(null, broadcast)}>{stylizeName(broadcast.name)}</a>
								<div class="ml-4 text-xs italic text-gray-700">
									<For each={broadcast.tracks}>
										{(track) => {
											return <div>{trackInfo(track.info)}</div>
										}}
									</For>
								</div>
							</li>
						)
					}}
				</For>
			</ul>
		</>
	)
}

function Buffer(props: { player: Player }) {
	const [timeline, setTimeline] = createSignal<Timeline>({ audio: { buffer: [] }, video: { buffer: [] } })

	createEffect(async () => {
		for await (const timeline of props.player.timeline()) {
			setTimeline(timeline)
		}
	})

	const playhead = createMemo(() => {
		return timeline().timestamp ?? 0
	})

	const bounds = createMemo(() => {
		const maxEnd = (ranges: Range[]) => {
			return ranges.reduce((max, range) => Math.max(max, range.end), 0)
		}

		const start = Math.max(playhead() - 2, 0)
		const end =
			Math.max(
				maxEnd(timeline().audio.buffer) + 1,
				maxEnd(timeline().video.buffer) + 1,
				playhead() + 3,
				start + 4
			) + 1
		return { start, end }
	})

	// Converts a value from to a 0-100 range based on the bounds.
	const asPercent = (value: number) => {
		return (100 * (value - bounds().start)) / (bounds().end - bounds().start)
	}

	const click = (e: MouseEvent) => {
		e.preventDefault()

		const rect = (e.target as HTMLElement).getBoundingClientRect()
		const pos = (e.clientX - rect.left) / rect.width // 0 - 1

		const timestamp = bounds().start + pos * (bounds().end - bounds().start)
		props.player.seek(timestamp)
	}

	// Called for both audio and video
	const Component = (props: { ranges: Range[] }) => {
		return (
			<div class="relative basis-1/2">
				<For each={props.ranges}>
					{(range) => {
						return (
							<div
								class="absolute bottom-0 top-0 bg-indigo-500 transition-pos"
								style={{
									left: `${asPercent(range.start)}%`,
									width: `${asPercent(range.end) - asPercent(range.start)}%`,
								}}
							></div>
						)
					}}
				</For>
			</div>
		)
	}

	const Legend = () => {
		const boundsRounded = createMemo(() => {
			return { start: Math.floor(bounds().start), end: Math.ceil(bounds().end) }
		})

		// Write the timestamp each second.
		const breakpoints = createMemo(() => {
			const bounds = boundsRounded()

			const breakpoints = []
			for (let i = bounds.start; i <= bounds.end; i++) {
				breakpoints.push(i)
			}

			return breakpoints
		})

		return (
			<For each={breakpoints()}>
				{(breakpoint) => {
					return (
						<div
							class="absolute bottom-0 top-0 text-sm text-white transition-pos"
							style={{ left: `${asPercent(breakpoint)}%` }}
						>
							{breakpoint}
						</div>
					)
				}}
			</For>
		)
	}

	const Playhead = () => {
		return (
			<div
				class="absolute bottom-0 top-0 w-1 bg-indigo-50/50 transition-pos"
				style={{
					left: `${asPercent(playhead())}%`,
				}}
			></div>
		)
	}

	return (
		<div class="transition-height relative flex h-6 flex-col duration-100" onClick={click}>
			<Component ranges={timeline().audio.buffer} />
			<Component ranges={timeline().video.buffer} />
			<Legend />
			<Playhead />
		</div>
	)
}
