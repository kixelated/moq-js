import { App } from "./app"

import { render } from "solid-js/web"

const app = document.getElementById("app")
if (!app) {
	throw new Error("no container")
}

render(() => <App />, app)
