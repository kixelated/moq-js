import { Broadcaster } from "~/main"

import { For } from "solid-js"
import { createStore } from "solid-js/store"

export function Main(props: { broadcaster: Broadcaster }) {
	return <></>
}

export function Settings(props: { broadcaster: Broadcaster }) {
	const [state, setState] = createStore({
		name: "",
		codec: "h.264",
		resolution: "720p",
		fps: 30,
		bitrate: 2000,
	})

	const options = {
		codec: ["h.264"],
		resolution: ["480p", "720p", "1080p", "1440p"],
		fps: [15, 30, 60],
		bitrate: { min: 500, max: 4000 },
	}

	return (
		<>
			<p class="mb-6 text-center font-mono text-xl">Broadcast</p>

			<form class="grid grid-cols-3 items-center gap-2 text-sm text-gray-900">
				<label for="name" class="col-start-1 block font-medium">
					Name
				</label>
				<div class="form-input col-span-2 w-full rounded-md border-0 text-sm shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600">
					<span>anon.quic.video/</span>
					<input
						type="text"
						name="name"
						placeholder="random"
						class="block border-0 bg-transparent p-1 pl-3 text-sm text-gray-900 placeholder:text-gray-400 focus:ring-0"
						value={state.name}
						onInput={(e) => setState({ name: e.target.value })}
					/>
				</div>
				<label for="codec" class="col-start-1 font-medium leading-6">
					Codec
				</label>
				<select
					name="codec"
					class="col-span-2 rounded-md border-0 text-sm shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600"
					onInput={(e) => setState({ codec: e.target.value })}
				>
					<For each={options.codec}>
						{(codec) => {
							return (
								<option value={codec} selected={codec === state.codec}>
									{codec}
								</option>
							)
						}}
					</For>
				</select>
				<label for="resolution" class="col-start-1 font-medium leading-6">
					Resolution
				</label>
				<select
					name="resolution"
					class="col-span-2 rounded-md border-0 text-sm shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600"
					onInput={(e) => setState({ resolution: e.target.value })}
				>
					<For each={options.resolution}>
						{(res) => {
							return (
								<option value="{res}" selected={res === state.resolution}>
									{res}
								</option>
							)
						}}
					</For>
				</select>
				<label for="fps" class="col-start-1 font-medium">
					FPS
				</label>
				<select
					name="fps"
					class="col-span-2 rounded-md border-0 text-sm shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600"
					onInput={(e) => setState({ fps: parseInt(e.target.value) })}
				>
					<For each={options.fps}>
						{(fps) => {
							return (
								<option value="{fps}" selected={fps === state.fps}>
									{fps}
								</option>
							)
						}}
					</For>
				</select>
				<label for="bitrate" class="col-start-1 font-medium">
					Bitrate
				</label>
				<input
					type="range"
					name="bitrate"
					min={options.bitrate.min}
					max={options.bitrate.max}
					step="100"
					value={state.bitrate}
					onInput={(e) => setState({ bitrate: parseInt(e.target.value) })}
				/>
				<span class="text-left text-xs">{state.bitrate} Kb/s</span>
				<button
					class="col-span-1 col-start-3 mt-3 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
					type="submit"
				>
					Go Live
				</button>
			</form>
		</>
	)
}
