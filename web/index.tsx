import { ErrorBoundary } from "solid-js"
import { render } from "solid-js/web"
import { A, Route, Router, Routes } from "@solidjs/router"

import { Watch, Listings } from "./watch"
import { Publish } from "./publish"
import { Connect } from "./connection"

// Import the icons using this trick so Parcel can rewrite the URLs.
const icons = {
	logo: new URL("./img/logo.svg", import.meta.url),
	watch: new URL("./img/watch.svg", import.meta.url),
	publish: new URL("./img/publish.svg", import.meta.url),
	explain: new URL("./img/explain.svg", import.meta.url),
	source: new URL("./img/source.svg", import.meta.url),
}

function Home() {
	return "UNDER CONTRSTRUCTION"
}

function Main() {
	return (
		<Router>
			<div class="flex flex-col sm:flex-row">
				<div class="flex-grow" />
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
					<ErrorBoundary
						fallback={(err: Error) => (
							<div class="rounded-md bg-red-600 px-4 py-2 font-bold">
								Uncaught Error: {err.name}: {err.message}
							</div>
						)}
					>
						<Connect>
							<Routes>
								<Route path="/" component={Home} />
								<Route path="/watch" component={Listings} />
								<Route path="/watch/*name" component={Watch} />
								<Route path="/publish" component={Publish} />
								<Route path="/*all" element={<p>404 Not found</p>} />
							</Routes>
						</Connect>
					</ErrorBoundary>
				</div>
				<div class="flex-grow" />
			</div>
		</Router>
	)
}

const dispose = render(Main, document.body)
if (module.hot) {
	module.hot.accept()
	module.hot.dispose(dispose)
}
