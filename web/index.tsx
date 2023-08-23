import { render } from "solid-js/web"
import { A, Route, Router, Routes } from "@solidjs/router"

const icons = {
	logo: new URL("./nav/logo.svg", import.meta.url),
	watch: new URL("./nav/watch.svg", import.meta.url),
	publish: new URL("./nav/publish.svg", import.meta.url),
	explain: new URL("./nav/explain.svg", import.meta.url),
	source: new URL("./nav/source.svg", import.meta.url),
}

import Watch from "./watch"
import Publish from "./publish"

function Home() {
	return "UNDER CONTRSTRUCTION"
}

function Main() {
	return (
		<Router>
			<div class="flex flex-col sm:flex-row">
				<div class="flex-grow"></div>
				<nav class="flex basis-[120] flex-row items-center sm:basis-[200] sm:flex-col">
					<A href="/" class="p-4">
						<img src={icons.logo.toString()} width="200" alt="Media over QUIC" />
					</A>
					<div class="flex flex-row flex-wrap items-center justify-start gap-4 p-4 sm:justify-center">
						<A href="/watch">
							<img src={icons.watch.toString()} width="120" alt="Watch" />
						</A>
						<A href="/publish">
							<img src={icons.publish.toString()} width="120" alt="Publish" />
						</A>
						<A href="/explain">
							<img src={icons.explain.toString()} width="120" alt="Explain" />
						</A>
						<a href="https://github.com/kixelated/moq-js">
							<img src={icons.source.toString()} width="120" alt="Source" />
						</a>
					</div>
				</nav>
				<div class="basis-[720] p-4">
					<Routes>
						<Route path="/" component={Home} />
						<Route path="/watch" component={Watch} />
						<Route path="/publish" component={Publish} />
					</Routes>
				</div>
				<div class="flex-grow"></div>
			</div>
		</Router>
	)
}

const dispose = render(Main, document.body)
if (module.hot) {
	module.hot.accept()
	module.hot.dispose(dispose)
}
