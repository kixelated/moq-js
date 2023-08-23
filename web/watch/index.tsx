import { Player } from "@kixelated/moq/playback"

import { createSignal, createEffect, Show } from "solid-js"
import { Announced } from "./announced"
import { Controls } from "./controls"

export function Main() {
	const [error, setError] = createSignal<Error | undefined>()
	const [player, setPlayer] = createSignal<Player | undefined>()

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

			<Show when={player()} fallback={<Announced setPlayer={setPlayer} setError={setError} />}>
				<Controls player={player()!} />
			</Show>
		</>
	)
}

import { render } from "solid-js/web"

const main = document.getElementById("main")
if (!main) throw new Error("no container")

render(() => <Main />, main)
