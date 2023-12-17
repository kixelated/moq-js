import { onCleanup, onMount } from "solid-js"

// Print the current time to check the latency.
export default function Clock() {
	let element!: HTMLDivElement

	onMount(() => {
		let frame: number

		const repaint = () => {
			element.textContent = "browser: " + new Date().toISOString().split("T")[1].slice(0, 12)
			frame = requestAnimationFrame(repaint)
		}

		frame = requestAnimationFrame(repaint)
		onCleanup(() => cancelAnimationFrame(frame))
	})

	return (
		<div class="mx-6 my-3 flex flex-row gap-6 font-mono">
			<div class="text-yellow-300">note: clocks are not synchronized</div>
			<div class="flex-grow text-right" ref={element} />
		</div>
	)
}
