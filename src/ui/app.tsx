import { connect } from "../transport/client"
import { asError } from "../common/error"

import { createSignal, createResource, Show, createEffect, createMemo, ErrorBoundary } from "solid-js"

import * as Watch from "./watch"
import * as Publish from "./publish"

import { Player } from "../playback"
import { Broadcast } from "../contribute"

export function App(props: { url: string }) {
	return (
		<div class="flex flex-col overflow-hidden rounded-lg bg-black shadow-xl ring-1 ring-gray-900/5">
			<ErrorBoundary fallback={ErrorNotice}>
				<AppInner url={props.url} />
			</ErrorBoundary>
		</div>
	)
}

export function AppInner(props: { url: string }) {
	const [connection, { mutate: setConnection }] = createResource(async () => {
		return await connect({
			url: props.url,
			role: "both",
			fingerprint: props.url + "/fingerprint",
		})
	})

	createEffect(async () => {
		const conn = connection()
		if (!conn) return

		try {
			await conn.run()
		} finally {
			setConnection()
		}
	})

	const [player, setPlayer] = createSignal<Player | undefined>()
	const [broadcast, setBroadcast] = createSignal<Broadcast | undefined>()
	const setup = createMemo(() => !player() && !broadcast())

	return (
		<>
			<div
				class="flex flex-col overflow-hidden transition-size duration-1000"
				classList={{ "h-[500]": !!player(), "h-0": !player() }}
			>
				<Show when={player()}>
					<Watch.Main player={player()!} />
				</Show>
			</div>

			<div
				class="flex flex-col overflow-hidden transition-size duration-1000"
				classList={{ "h-[500]": !!broadcast(), "h-0": !broadcast() }}
			>
				<Show when={broadcast()}>
					<Publish.Main broadcast={broadcast()!} />
				</Show>
			</div>

			<div
				class="flex flex-row bg-white/90 transition-size duration-1000"
				classList={{ "h-96": setup(), "h-0": setup() }}
			>
				<div class="basis-1/2 p-6">
					<Watch.Setup connection={connection()} setPlayer={setPlayer} />
				</div>
				<div class="basis-0 border-l-2 border-dotted border-black/20"></div>
				<div class="basis-1/2 p-6">
					<Publish.Setup connection={connection()} setBroadcast={setBroadcast} />
				</div>
			</div>
		</>
	)
}

function ErrorNotice(error: any) {
	const err = asError(error)

	return (
		<>
			<div class="bg-red-400 px-4 py-2 font-bold">
				{err.name}: {err.message}
			</div>
		</>
	)
}
