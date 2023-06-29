import { Player, Range, Timeline as State } from "~/main"
import { Connection } from "~/transport"

import {
	createSignal,
	createMemo,
	onMount,
	Suspense,
	mapArray,
	Accessor,
	For,
	Switch,
	ErrorBoundary,
	Show,
	Match,
	createEffect,
	createResource,
} from "solid-js"
import { createStore } from "solid-js/store"

export function Main(props: { player: Player }) {
	return <Timeline player={props.player} />
}

export function Settings(props: { player: Player }) {
	return (
		<>
			<p class="mb-6 text-center font-mono text-xl">Watch</p>
			<ErrorBoundary fallback={(err) => <p class="text-m text-red-700">{err.message}</p>}>
				<Broadcasts player={props.player} />
			</ErrorBoundary>
		</>
	)
}

function Broadcasts(props: { player: Player }) {
	const gen = props.player.broadcasts()
	const [broadcasts, { refetch }] = createResource(async () => {
		try {
			const next = await gen.next()
			if (next.done) {
				throw "unexpected end"
			}
			return next.value
		} catch (e) {
			console.error("got error", e)
			throw e
		}
	})

	createEffect(() => {
		broadcasts()
		refetch()
	})

	return (
		<>
			<ul>
				<For each={broadcasts.latest}>
					{(broadcast) => {
						return (
							<li class="mt-4">
								<a>{broadcast}</a>
							</li>
						)
					}}
				</For>
			</ul>
			<Show when={broadcasts.loading}>
				<p class="mt-4 text-center text-xs">waiting for broadcasts...</p>
			</Show>
		</>
	)
}

/* TODO fetch the catalog for each broadcast
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
*/

function Timeline(props: { player: Player }) {
	const [playhead, setPlayhead] = createSignal(0)
	setInterval(() => setPlayhead((x) => x + 0.01), 10)

	// Show 5 seconds before and 5 seconds after the current playhead.
	const bounds = createMemo(() => {
		return { start: playhead() - 5, end: playhead() + 5 }
	})

	const [audio, setAudio] = createSignal([
		{ start: 0, end: 0.5 },
		{ start: 1.0, end: 2.0 },
	])

	const [video, setVideo] = createSignal([
		{ start: 0, end: 0.7 },
		{ start: 1.0, end: 2.1 },
	])

	const click = (e: MouseEvent) => {
		e.preventDefault()

		const bound = bounds()
		const rect = (e.target as HTMLElement).getBoundingClientRect()
		const pos = (e.clientX - rect.left) / rect.width // 0 - 1

		const timestamp = bound.start + pos * (bound.end - bound.start)
		props.player.seek(timestamp)
	}

	return (
		<div class="relative flex flex-col bg-black" onClick={click}>
			<Component bounds={bounds()} ranges={audio()} />
			<Component bounds={bounds()} ranges={video()} />
			<Legend bounds={bounds()} />
			<Playhead />
		</div>
	)
}

function Component(props: { bounds: Range; ranges: Range[] }) {
	return (
		<div class="relative h-2">
			<For each={props.ranges}>
				{(range) => {
					// example:
					// input = 6
					// bounds.start = 3
					// bounds.end = 13
					// output = 30%
					const position = (input: number) => {
						return (100 * (input - props.bounds.start)) / (props.bounds.end - props.bounds.start)
					}

					return (
						<div
							class="fill absolute h-full bg-indigo-400"
							style={{
								left: position(range.start) + "%",
								width: position(range.end) - position(range.start) + "%",
							}}
						></div>
					)
				}}
			</For>
		</div>
	)
}

function Playhead() {
	// Fixed in the middle for now
	return <div class="absolute left-1/2 right-1/2 border-l-2 border-indigo-50"></div>
}

function Legend(props: { bounds: Range }) {
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
		<div class="absolute inset-0 text-center text-xs text-indigo-50">
			<For each={breakpoints()}>
				{(breakpoint) => {
					const position = (input: number) => {
						return (100 * (input - props.bounds.start)) / (props.bounds.end - props.bounds.start)
					}

					// TODO center the text based on the width
					return (
						<div class="absolute" style={{ left: position(breakpoint) + "%" }}>
							{breakpoint}
						</div>
					)
				}}
			</For>
		</div>
	)
}
