import { Player, Info, Range } from "./player"

export class Timeline {
	#player: Player
	#info?: Info

	#parent: HTMLElement
	#audio: HTMLElement
	#video: HTMLElement
	#playhead: HTMLElement
	#legend: HTMLElement

	constructor(player: Player, parent: HTMLElement) {
		this.#player = player

		const audio = parent.querySelector<HTMLElement>(".audio")
		const video = parent.querySelector<HTMLElement>(".video")
		const playhead = parent.querySelector<HTMLElement>(".playhead")
		const legend = parent.querySelector<HTMLElement>(".legend")

		if (!audio) throw new Error("missing audio")
		if (!video) throw new Error("missing video")
		if (!playhead) throw new Error("missing playhead")
		if (!legend) throw new Error("missing legend")

		this.#parent = parent
		this.#audio = audio
		this.#video = video
		this.#playhead = playhead
		this.#legend = legend

		parent.addEventListener("click", this.#onClick.bind(this))
	}

	async run() {
		// Start the render loop
		this.#render(performance.now())

		let epoch = 0
		for (;;) {
			this.#info = await this.#player.info(epoch)

			// Update the cursor when we can seek.
			this.#parent.style.cursor = this.#info.timestamp !== undefined ? "pointer" : "default"

			epoch = this.#info.epoch + 1
		}
	}

	#onClick(e: MouseEvent) {
		e.preventDefault()

		if (!this.#info || !this.#info.timestamp) return

		const timestamp = this.#info.timestamp
		const rect = this.#parent.getBoundingClientRect()
		const seek = (e.clientX - rect.left) / rect.width

		const newTimestamp = timestamp + (seek - 0.5) * 10
		this.#player.seek(newTimestamp)
	}

	#render(_now: number) {
		const info = this.#info // less typing

		if (info && info.timestamp) {
			this.#renderRanges(this.#audio, info.timestamp, info.audio.buffer)
			this.#renderRanges(this.#video, info.timestamp, info.video.buffer)
			this.#renderPlayhead(this.#playhead, info.timestamp)
			this.#renderLegend(this.#legend, info.timestamp)
		}

		requestAnimationFrame(this.#render.bind(this))
	}

	#renderRanges(parent: HTMLElement, timestamp: number, ranges: Range[]) {
		// Add divs until we have enough
		while (parent.children.length < ranges.length) {
			const fill = document.createElement("div")
			fill.className = "fill"
			parent.appendChild(fill)
		}

		// Remove excess divs
		while (parent.children.length > ranges.length) {
			parent.removeChild(parent.lastChild!)
		}

		for (let i = 0; i < ranges.length; i += 1) {
			const fill = parent.children[i] as HTMLElement
			const range = ranges[i]

			// 0%: timestamp - 5s
			// 50%: timestamp
			// 100%: timestamp + 5s

			const left = Math.max(5 + range.start - timestamp, 0)
			const right = Math.max(5 + timestamp - range.end, 0)

			fill.style.left = `${left * 10}%`
			fill.style.right = `${right * 10}%`
		}
	}

	#renderPlayhead(parent: HTMLElement, _timestamp: number) {
		parent.style.left = "50%"
		parent.style.right = "50%"
	}

	#renderLegend(parent: HTMLElement, timestamp: number) {
		// 0%: timestamp - 5s
		// 50%: timestamp
		// 100%: timestamp + 5s

		const min = Math.floor(timestamp) - 5
		const max = min + 10

		// Remove any existing divs that are newly out of range
		for (let i = 0; i < parent.children.length; i += 1) {
			const child = parent.children[i] as HTMLElement
			const text = parseInt(child.innerText)
			if (text >= min && text <= max) continue

			parent.removeChild(child)
			i -= 1
		}

		const existing = Array.from(parent.children)

		for (let i = min; i <= max; i += 1) {
			// We're looking for an existing div with this text
			const text = `${i}`

			let found = existing.find((c) => (c as HTMLElement).innerText === text)
			if (!found) {
				found = document.createElement("div")
				parent.appendChild(found)
			}

			const child = found as HTMLElement

			const left = 5 + i - timestamp
			const right = 5 + timestamp - i

			child.className = "text"
			child.style.left = `${left * 10}%`
			child.style.right = `${right * 10}%`
			child.innerText = text
		}
	}
}
