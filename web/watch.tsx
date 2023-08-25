import { Player } from "@kixelated/moq/playback"
import { Connection } from "@kixelated/moq/transport"
import { useParams } from "@solidjs/router"

import { For, createEffect, Show, Switch, Match } from "solid-js"
import {
	AudioCatalogTrack,
	Catalog,
	VideoCatalogTrack,
	isAudioCatalogTrack,
	isVideoCatalogTrack,
} from "@kixelated/moq/media"
import { A } from "@solidjs/router"
import { createFetch, createRunner } from "./common"
import { useConnection } from "./connection"

export function Watch() {
	const params = useParams()

	const player = createRunner<Player, Connection>(async (ready, connection) => {
		// TODO move the catalog fetch into the player
		const catalog = await Catalog.fetch(connection, params.name)

		const broadcast = { namespace: params.name, catalog }
		const player = new Player({ connection, broadcast })

		ready(player)

		throw await player.closed()
	}, useConnection())

	// Render the canvas when the DOM is inserted
	let canvas: HTMLCanvasElement
	createEffect(() => player()?.attach(canvas))

	// Report errors to terminal too so we'll get stack traces
	createEffect(() => {
		if (player.error()) console.error(player.error())
	})

	// NOTE: The canvas automatically has width/height set to the decoded video size.
	// TODO shrink it if needed via CSS
	return (
		<>
			<Show when={player.error()}>
				<div class="rounded-md bg-red-600 px-4 py-2 font-bold">
					{player.error()!.name}: {player.error()!.message}
				</div>
			</Show>
			<Listing name={params.name} catalog={player()?.broadcast.catalog} />
			<canvas ref={canvas!} class="rounded-md" />
		</>
	)
}

export function Listings() {
	const broadcasts = createRunner<string[], Connection>(async (set, connection) => {
		let broadcasts = new Array<string>()

		for (;;) {
			// Wait for the next broadcast
			const broadcast = await connection.announced()
			if (!broadcast) break

			// Append to the start so newest entries are first.
			broadcasts = [broadcast.namespace, ...broadcasts]
			set(broadcasts)
		}
	}, useConnection())

	return (
		<>
			<p class="p-4">
				Watch a <b class="text-green-500">PUBLIC</b> broadcast. Report any abuse pls.
			</p>

			<header class="mt-6 border-b-2 border-green-600 pl-3 text-xl">Broadcasts</header>
			<For
				each={broadcasts()}
				fallback={
					<p class="p-4">
						No live broadcasts. Somebody should <A href="/publish">PUBLISH</A>.
					</p>
				}
			>
				{(broadcast) => {
					const catalog = createFetch(async (connection) => {
						return await Catalog.fetch(connection, broadcast)
					}, useConnection())

					return <Listing name={broadcast} catalog={catalog()} />
				}}
			</For>
		</>
	)
}

export function Listing(props: { name: string; catalog?: Catalog }) {
	function audioTrack(track: AudioCatalogTrack) {
		return (
			<>
				audio: {track.codec} {track.sample_rate}Hz {track.channel_count}ch
				<Show when={track.bit_rate}> {Math.round(track.bit_rate! / 1000) + "kb/s"}</Show>
			</>
		)
	}

	function videoTrack(track: VideoCatalogTrack) {
		return (
			<>
				video: {track.codec} {track.width}x{track.height}
				<Show when={track.bit_rate}> {(track.bit_rate! / 1000000).toFixed(1) + " mb/s"}</Show>
			</>
		)
	}

	return (
		<div class="p-4">
			<A href={"/watch/" + props.name} class="text-xl">
				{props.name.replace(/\//, " / ")}
			</A>
			<div class="ml-4 text-xs italic text-gray-300">
				<For each={props.catalog?.tracks}>
					{(track) => (
						<p>
							<Switch fallback="unknown track">
								<Match when={isVideoCatalogTrack(track)}>
									{videoTrack(track as VideoCatalogTrack)}
								</Match>
								<Match when={isAudioCatalogTrack(track)}>
									{audioTrack(track as AudioCatalogTrack)}
								</Match>
							</Switch>
						</p>
					)}
				</For>
			</div>
		</div>
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
