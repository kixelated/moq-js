import { Player } from "./player"
import * as Transport from "./transport/connection"

const params = new URLSearchParams(window.location.search)

const url = params.get("url") || "https://localhost:4443"
const fingerprintUrl = url + "/fingerprint"

const transport = new Transport.Connection({
	url,
	fingerprintUrl,
})

const canvas = document.querySelector<HTMLCanvasElement>("canvas#video")!

const player = new Player(transport, canvas.transferControlToOffscreen())

const play = document.querySelector<HTMLElement>("#screen #play")!

const playFunc = (e: Event) => {
	player.play()
	e.preventDefault()

	play.removeEventListener("click", playFunc)
	play.style.display = "none"
}

play.addEventListener("click", playFunc)
