import { Player } from "@kixelated/moq/playback"
import { Client } from "@kixelated/moq/transport"

import { createEffect, Show, createMemo, createSignal } from "solid-js"
import { useParams, useSearchParams } from "@solidjs/router"

import { createFetch } from "./common"
import { Listing } from "./listing"
import { Notice } from "./issues"

export function Watch() {
	const params = useParams<{ name: string }>()
	const [query] = useSearchParams<{ server?: string }>()

	const server = query.server || process.env.RELAY_HOST
	const name = params.name

	// Render the canvas when the DOM is inserted
	const [canvas, setCanvas] = createSignal<HTMLCanvasElement | undefined>()

	// Create the player as soon as the canvas is in the DOM.
	const player = createFetch(async (canvas: HTMLCanvasElement) => {
		const url = `https://${server}/${name}`

		// Special case localhost to fetch the TLS fingerprint from the server.
		// TODO remove this when WebTransport correctly supports self-signed certificates
		const fingerprint = server.startsWith("localhost") ? `https://${server}/fingerprint` : undefined

		const client = new Client({
			url,
			fingerprint,
			role: "subscriber",
		})

		const connection = await client.connect()

		return new Player({ connection, canvas })
	}, canvas)

	const playerClosed = createFetch((player) => player.closed(), player)

	// Fetch the catalog when the player is running.
	const catalog = createFetch((player) => player.catalog(), player)

	const error = createMemo(() => player.error() || playerClosed() || catalog.error())

	// Report errors to terminal too so we'll get stack traces
	createEffect(() => {
		if (error()) console.error(error())
	})

	// NOTE: The canvas automatically has width/height set to the decoded video size.
	// TODO shrink it if needed via CSS
	return (
		<>
			<Notice />

			<Show when={error()}>
				<div class="rounded-md bg-red-600 px-4 py-2 font-bold">
					{error()!.name}: {error()!.message}
				</div>
			</Show>

			<canvas height="0" ref={setCanvas} class="rounded-md" />
			<Listing server={server} name={name} catalog={catalog()} />
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
