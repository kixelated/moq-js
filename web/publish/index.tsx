import { Broadcast } from "@kixelated/moq/contribute"

import { createEffect, createSignal, Show } from "solid-js"

import { Preview } from "./preview"
import { Setup } from "./setup"

export default function Main() {
	const [error, setError] = createSignal<Error | undefined>()
	const [broadcast, setBroadcast] = createSignal<Broadcast | undefined>()

	createEffect(() => {
		const err = error()
		if (err) console.error(err)
	})

	return (
		<>
			<Show when={error()}>
				<div class="bg-red-600 px-4 py-2 font-bold">
					{error()?.name}: {error()?.message}
				</div>
			</Show>

			<Show when={broadcast()} fallback={<Setup setBroadcast={setBroadcast} setError={setError} />}>
				<Preview broadcast={broadcast()!} />
			</Show>
		</>
	)
}
