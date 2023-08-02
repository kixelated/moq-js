import { Connection } from "../transport/connection"
import { Player } from "../playback/player"
import { Broadcast, Announced } from "../playback/announced"
import { Track } from "../common/catalog"
import { asError } from "../common/error"

import { createSignal, onMount, Switch, Match, For, createEffect } from "solid-js"

export function Main(props: { player: Player; setError(e: Error): void; setPlayer(): void }) {
	let canvas: HTMLCanvasElement

	onMount(() => {
		props.player.render(canvas)
		props.player.play()
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

	return (
		<>
			<canvas ref={canvas!} class="aspect-video bg-black"></canvas>
		</>
	)
}

export function Setup(props: { connection: Connection; setPlayer(v: Player): void; setError(e: Error): void }) {
	// Create an object that we'll use to list all of the broadcasts
	const announced = new Announced(props.connection)

	const [broadcast, setBroadcast] = createSignal<Broadcast | undefined>()
	const [broadcasts, setBroadcasts] = createSignal<Broadcast[]>([])

	createEffect(async () => {
		try {
			for (;;) {
				const broadcast = await announced.broadcast()
				if (!broadcast) break

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
	const name = props.broadcast.name.replace(/\//, " / ")

	const [tracks, setTracks] = createSignal<Track[]>([])
	const [error, setError] = createSignal<Error | undefined>()

	createEffect(async () => {
		try {
			const catalog = await props.broadcast.catalog
			setTracks(catalog.tracks)
		} catch (e) {
			setError(asError(e))
		}
	})

	// A function because Match doesn't work with Typescript type guards
	const trackInfo = (track: Track) => {
		// TODO put more information in the catalog
		return `${track.kind}: ${track.codec}`

		/*
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
		*/
	}

	const watch = (e: MouseEvent) => {
		e.preventDefault()
		props.select()
	}

	return (
		<>
			<a onClick={watch}>{name}</a>
			<div class="ml-4 text-xs italic text-gray-700">
				<Switch>
					<Match when={error()}>
						<p class="text-red-500">{error()!.message}</p>
					</Match>
					<Match when={tracks()}>
						<For each={tracks()}>
							{(track) => {
								return <div>{trackInfo(track)}</div>
							}}
						</For>
					</Match>
					<Match when={true}>
						<p>loading...</p>
					</Match>
				</Switch>
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
