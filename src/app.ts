import * as Player from "./player"
import * as Transport from "./transport/connection"

import { Timeline } from "./timeline"

export class App {
	#transport: Transport.Connection
	#player: Player.Player // TODO better name
	#timeline: Timeline

	// DOM elements
	#canvas: HTMLCanvasElement
	#play: HTMLElement

	constructor() {
		const canvas = document.querySelector<HTMLCanvasElement>("canvas#video")
		if (!canvas) throw new Error("missing canvas")

		const play = document.querySelector<HTMLElement>("#screen #play")
		if (!play) throw new Error("missing play button")

		const timeline = document.querySelector<HTMLElement>("#timeline")
		if (!timeline) throw new Error("missing timeline")

		this.#canvas = canvas
		this.#play = play

		const params = new URLSearchParams(window.location.search)
		const url = params.get("url") || "https://localhost:4443"
		const fingerprintUrl = url + "/fingerprint"

		this.#transport = new Transport.Connection({
			url,
			fingerprintUrl,
		})

		this.#player = new Player.Player(this.#transport, canvas.transferControlToOffscreen())
		this.#timeline = new Timeline(this.#player, timeline)

		this.#play.addEventListener("click", this.#onPlay.bind(this))
	}

	async run() {
		await this.#timeline.run()
	}

	#onPlay(e: Event) {
		e.preventDefault()

		this.#player.play()
		this.#play.removeEventListener("click", this.#onPlay.bind(this))
		this.#play.style.display = "none"
	}
}
