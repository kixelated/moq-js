/*
import { Player } from "~/main"
import { Connection } from "~/transport"
import { Timeline } from "./timeline"
*/

import { createSignal, onCleanup } from "solid-js"

export function App() {
	const [count, setCount] = createSignal(0)
	const interval = setInterval(() => setCount((c) => c + 1), 1000)
	onCleanup(() => clearInterval(interval))
	return <div>Count value is {count()}</div>
}

/*
export function App({ url }: { url: string }) {
	const canvasRef = React.useRef()

	// const timeline = new Timeline(player, timeline)

	useEffect(() => {
		const transport = new Connection({
			url,
			role: "subscriber",
			fingerprint: url + "/fingerprint",
		})

		const canvas = canvasRef.current
		const offscreen = canvasRef.current.transferControlToOffscreen()
		const player = new Player(transport, offscreen)
	}, [url])

	return <canvas ref={canvasRef} />
}

type AppState = {
	count: number // like this
}

export class App extends React.Component<AppProps, AppState> {
	#transport: Connection
	#player: Player
	#timeline: Timeline

	// DOM elements
	#canvas: HTMLCanvasElement
	#play: HTMLElement

	constructor(props: AppProps) {
		super(props)

		const params = new URLSearchParams(window.location.search)
		const url = params.get("url") || "https://localhost:4443"

		this.#transport = new Connection({
			url,
			role: "subscriber",
			fingerprint: url + "/fingerprint",
		})

		this.#player = new Player(this.#transport, canvas.transferControlToOffscreen())
		this.#timeline = new Timeline(this.#player, timeline)

		this.#play.addEventListener("click", this.#onPlay.bind(this))
	}

	render() {
		return (
			<div>
				{this.props.message} {this.state.count}
			</div>
		)
	}
}
*/
