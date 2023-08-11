import { Connection } from "../transport/connection"
import { Player } from "../playback/player"
import { Broadcast, Broadcasts } from "../playback/broadcast"
import { Track, isAudioTrack, isVideoTrack } from "../common/catalog"
import { asError } from "../common/error"

import { createSignal, onMount, For, createEffect, Show } from "solid-js"

export function Main(props: { player: Player; setError(e: Error): void; setPlayer(): void }) {
	let canvas: HTMLCanvasElement

	onMount(() => {
		props.player.attach(canvas)
		//props.player.play()
	})

	createEffect(async () => {
		try {
			await props.player.run()
		} catch (e) {
			props.setError(asError(e))
		} finally {
			props.setPlayer()
		}
	})

	// NOTE: The canvas automatically has width/height set to the decoded video size.
	// TODO shrink it if needed via CSS
	return <canvas ref={canvas!} class="bg-black"></canvas>
}

export function Setup(props: { connection: Connection; setPlayer(v: Player): void; setError(e: Error): void }) {
	// Create an object that we'll use to list all of the broadcasts
	const announced = new Broadcasts(props.connection)

	const [broadcast, setBroadcast] = createSignal<Broadcast | undefined>()
	const [broadcasts, setBroadcasts] = createSignal<Broadcast[]>([])

	createEffect(async () => {
		try {
			for (;;) {
				const broadcast = await announced.next()
				setBroadcasts((prev) => prev.concat(broadcast))
			}
		} catch (e) {
			props.setError(asError(e))
		}
	})

	createEffect(() => {
		const selected = broadcast()
		if (!selected) return

		const player = new Player(props.connection, selected)
		props.setPlayer(player)
	})

	return (
		<ul>
			<For each={broadcasts()} fallback={"No live broadcasts"}>
				{(broadcast) => {
					const select = () => {
						setBroadcast(broadcast)
					}
					return (
						<li class="mt-4">
							<Available broadcast={broadcast} select={select} />
						</li>
					)
				}}
			</For>
		</ul>
	)
}

function Available(props: { broadcast: Broadcast; select: () => void }) {
	// A function because Match doesn't work with Typescript type guards
	const trackInfo = (track: Track) => {
		if (isVideoTrack(track)) {
			return (
				<>
					video: {track.codec} {track.width}x{track.height}
					<Show when={track.bit_rate}> {track.bit_rate} b/s</Show>
				</>
			)
		} else if (isAudioTrack(track)) {
			return (
				<>
					audio: {track.codec} {track.sample_rate}Hz {track.channel_count}ch
					<Show when={track.bit_rate}> {track.bit_rate} b/s</Show>
				</>
			)
		} else {
			return "unknown track type"
		}
	}

	const watch = (e: MouseEvent) => {
		e.preventDefault()
		props.select()
	}

	return (
		<>
			<a onClick={watch}>{props.broadcast.name.replace(/\//, " / ")}</a>
			<div class="ml-4 text-xs italic text-gray-700">
				<For each={props.broadcast.catalog.tracks}>
					{(track) => {
						return <div>{trackInfo(track)}</div>
					}}
				</For>
			</div>
		</>
	)
}

/*
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
*/
