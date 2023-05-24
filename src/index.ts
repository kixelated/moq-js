import Player from "./player"
import Transport from "./transport"

const params = new URLSearchParams(window.location.search)

const url = params.get("url") || "https://localhost:4443/watch"
const canvas = document.querySelector<HTMLCanvasElement>("canvas#video")!

const transport = new Transport({
	url: url,
	/*
	fingerprint: {
		// TODO remove when Chrome accepts the system CA
		algorithm: "sha-256",
		value: new Uint8Array(fingerprint),
	},
	*/
})

const player = new Player({
	transport,
	canvas: canvas.transferControlToOffscreen(),
})

const play = document.querySelector<HTMLElement>("#screen #play")!

const playFunc = (e: Event) => {
	player.play()
	e.preventDefault()

	play.removeEventListener("click", playFunc)
	play.style.display = "none"
}

play.addEventListener("click", playFunc)
