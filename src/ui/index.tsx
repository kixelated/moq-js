import { App } from "./app"

import { render } from "solid-js/web"

const params = new URLSearchParams(window.location.search)
const url = params.get("url") ?? "https://localhost:4443"

const app = document.getElementById("app")
if (!app) {
	throw new Error("no container")
}

render(() => <App url={url} />, app)
